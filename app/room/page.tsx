
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";

import styles from "./Room.module.css";
import { getSupabase } from "../../lib/supabase";

import {
  ensureUser,
  loadRoom,
  leaveRoom,
  setPlayerReady,
  startRoom,
  type PawnColor,
  type RoomSnapshot,
} from "../../lib/rooms";

import {
  heartbeatRoom,
  isPlayerOnline,
  HEARTBEAT_INTERVAL_MS,
} from "../../lib/presence";

// ==========================================
// CITYROLL — POCZEKALNIA MULTIPLAYER
// ==========================================

const PAWN_COLORS: Record<PawnColor, string> = {
  purple: "#9B77F5",
  blue: "#58A5F7",
  green: "#54C9A4",
  orange: "#FFAB66",
};

// ==========================================
// GRAFIKA PIONKA
// ==========================================

function PawnIcon({ color }: { color: PawnColor }) {
  return (
    <svg
      viewBox="0 0 48 60"
      width="30"
      height="38"
      fill={PAWN_COLORS[color]}
      aria-hidden="true"
    >
      <circle cx="24" cy="13" r="10" />

      <path d="M19 25H29L38 46H10L19 25Z" />

      <rect
        x="7"
        y="44"
        width="34"
        height="11"
        rx="5"
      />
    </svg>
  );
}

// ==========================================
// EKRAN ŁADOWANIA LUB BŁĘDU
// ==========================================

function RoomStatusScreen({
  loading,
  message,
  roomCode,
}: {
  loading: boolean;
  message: string;
  roomCode: string | null;
}) {
  const router = useRouter();

  function returnToMenu() {
    if (roomCode) {
      router.replace(
        `/?room=${encodeURIComponent(roomCode)}`
      );
    } else {
      router.replace("/");
    }
  }

  return (
    <main className={styles.screen}>
      <div className={styles.stateScreen}>
        <div className={styles.loadingContent}>
          {loading ? (
            <>
              <div className={styles.loadingLogo}>
                <span className={styles.loadingDice}>
                  🎲
                </span>
              </div>

              <div
                className={styles.spinner}
                aria-hidden="true"
              />

              <h1>Otwieramy pokój...</h1>

              <p>
                Przygotowujemy miejsce dla Twojej ekipy.
              </p>
            </>
          ) : (
            <>
              <div className={styles.errorIcon}>!</div>

              <h1>Nie można otworzyć pokoju</h1>

              <p role="alert">
                {message || "Spróbuj ponownie."}
              </p>

              <button
                type="button"
                className={styles.retryButton}
                onClick={() => window.location.reload()}
              >
                Spróbuj ponownie
              </button>

              <button
                type="button"
                className={styles.homeLink}
                onClick={returnToMenu}
              >
                {roomCode
                  ? "Dołącz ponownie"
                  : "Wróć do menu"}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

// ==========================================
// GŁÓWNY EKRAN
// ==========================================

export default function RoomPage() {
  const router = useRouter();

  const [room, setRoom] =
    useState<RoomSnapshot | null>(null);

  const [myId, setMyId] =
    useState<string | null>(null);

  const [lastRoomCode, setLastRoomCode] =
    useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [connectionMessage, setConnectionMessage] =
    useState("");

  const [currentTime, setCurrentTime] =
    useState<number | null>(null);

  // Blokuje sygnały aktywności podczas wychodzenia.
  const leavingRef = useRef(false);

  // ========================================
  // POŁĄCZENIE Z POKOJEM
  // ========================================

  useEffect(() => {
    const roomId = new URLSearchParams(
      window.location.search
    ).get("id");

    if (!roomId) {
      setLoadError("Nie znaleziono pokoju.");
      setLoading(false);
      return;
    }

    let active = true;
    let userId: string | null = null;
    let channel: RealtimeChannel | null = null;

    let heartbeatTimer:
      | ReturnType<typeof setInterval>
      | null = null;

    let clockTimer:
      | ReturnType<typeof setInterval>
      | null = null;

    let heartbeatBusy = false;

    // ======================================
    // OBSŁUGA UTRATY MIEJSCA
    // ======================================

    function handleConnectionError(error: unknown) {
      if (!active) return;

      const rawMessage =
        error instanceof Error
          ? error.message
          : String(error);

      // Serwer potwierdził, że gracz
      // nie jest już uczestnikiem pokoju.

      if (
        rawMessage.includes("Nie należysz") ||
        rawMessage.includes("Pokój nie istnieje") ||
        rawMessage.includes("Miejsce wygasło")
      ) {
        setRoom(null);
        setLoadError(
          "Twoje miejsce wygasło. Możesz spróbować dołączyć ponownie."
        );
        return;
      }

      // Tymczasowy problem z internetem
      // nie oznacza utraty miejsca.

      setConnectionMessage(
        "Połączenie przerwane. Próbujemy ponownie..."
      );
    }

    // ======================================
    // ODCZYT AKTUALNEGO STANU
    // ======================================

    async function refreshRoom() {
      if (!roomId || !active) return;

      const updatedRoom = await loadRoom(roomId);

      if (!active) return;

      if (
        userId &&
        !updatedRoom.players.some(
          (player) => player.user_id === userId
        )
      ) {
        throw new Error("Miejsce wygasło");
      }

      setRoom(updatedRoom);
      setLastRoomCode(updatedRoom.code);
    }

    // ======================================
    // WYSYŁANIE SYGNAŁU AKTYWNOŚCI
    // ======================================

    async function sendHeartbeat() {
      if (!roomId || !active) return;
      if (heartbeatBusy || leavingRef.current) return;

      if (!navigator.onLine) {
        setConnectionMessage(
          "Brak internetu. Czekamy na połączenie..."
        );
        return;
      }

      heartbeatBusy = true;

      try {
        // Supabase aktualizuje ostatnią aktywność.
        await heartbeatRoom(roomId);

        if (!active) return;

        // Odświeżamy również dane pokoju.
        await refreshRoom();

        if (active) {
          setConnectionMessage("");
        }
      } catch (error) {
        handleConnectionError(error);
      } finally {
        heartbeatBusy = false;
      }
    }

    // ======================================
    // POWRÓT INTERNETU LUB DO APLIKACJI
    // ======================================

    function handleReconnect() {
      if (!active) return;
      void sendHeartbeat();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void sendHeartbeat();
      }
    }

    // ======================================
    // PIERWSZE POŁĄCZENIE
    // ======================================

    async function connect() {
      try {
        const user = await ensureUser();

        if (!active) return;

        userId = user.id;
        setMyId(user.id);

        // Odnawiamy aktywność przed pobraniem
        // pokoju. Przy odświeżeniu strony
        // zachowujemy dotychczasowe miejsce.

        await heartbeatRoom(roomId!);

        if (!active) return;

        await refreshRoom();

        if (!active) return;

        const supabase = getSupabase();

        // Zmiany listy graczy i gotowości.
        // Każde zdarzenie odświeża dane.

        channel = supabase
          .channel(`cityroll-room-${roomId}`)

          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "cityroll_players",
              filter: `room_id=eq.${roomId}`,
            },
            () => {
              void refreshRoom().catch(
                handleConnectionError
              );
            }
          )

          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "cityroll_players",
              filter: `room_id=eq.${roomId}`,
            },
            () => {
              void refreshRoom().catch(
                handleConnectionError
              );
            }
          )

          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "cityroll_rooms",
              filter: `id=eq.${roomId}`,
            },
            () => {
              void refreshRoom().catch(
                handleConnectionError
              );
            }
          )

          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              void refreshRoom().catch(
                handleConnectionError
              );
            }
          });

        // Automatyczne odnawianie sesji gracza.
        heartbeatTimer = setInterval(
          () => {
            void sendHeartbeat();
          },
          HEARTBEAT_INTERVAL_MS
        );

        // Odświeżanie statusu online na ekranie.
        setCurrentTime(Date.now());

        clockTimer = setInterval(() => {
          if (active) {
            setCurrentTime(Date.now());
          }
        }, 15_000);

        // Reakcja na odzyskanie połączenia.
        window.addEventListener(
          "online",
          handleReconnect
        );

        window.addEventListener(
          "focus",
          handleReconnect
        );

        document.addEventListener(
          "visibilitychange",
          handleVisibilityChange
        );
      } catch (error) {
        if (!active) return;

        console.error(
          "CityRoll — otwieranie pokoju:",
          error
        );

        const errorText =
          error instanceof Error
            ? error.message
            : "";

        setLoadError(
          errorText.includes("Nie należysz")
            ? "Nie jesteś już uczestnikiem tego pokoju."
            : "Nie udało się otworzyć pokoju. Spróbuj ponownie."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void connect();

    // ======================================
    // ZAMKNIĘCIE EKRANU
    // ======================================

    return () => {
      active = false;

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }

      if (clockTimer) {
        clearInterval(clockTimer);
      }

      window.removeEventListener(
        "online",
        handleReconnect
      );

      window.removeEventListener(
        "focus",
        handleReconnect
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );

      if (channel) {
        void getSupabase().removeChannel(channel);
      }

      // Nie usuwamy tutaj gracza z bazy.
      // Przy przypadkowym zamknięciu
      // okres ochronny wynosi 3 minuty.
    };
  }, []);

  // ========================================
  // STAN GRACZA I POKOJU
  // ========================================

  const me = room?.players.find(
    (player) => player.user_id === myId
  );

  const isHost = Boolean(
    room && myId && room.host_id === myId
  );

  const isPlaying = room?.status === "playing";

  const readyCount =
    room?.players.filter(
      (player) => player.ready
    ).length ?? 0;

  const canStart = Boolean(
    room &&
    isHost &&
    !isPlaying &&
    room.players.length >= 2 &&
    room.players.every(
      (player) => player.ready
    )
  );

  // ========================================
  // OPUSZCZANIE POKOJU
  // ========================================

  async function handleLeave() {
    if (!room || busy || leaving || isPlaying) return;

    leavingRef.current = true;

    setLeaving(true);
    setMessage("");

    try {
      await leaveRoom(room.id);
      router.replace("/");
    } catch (error) {
      console.error(
        "CityRoll — opuszczanie pokoju:",
        error
      );

      leavingRef.current = false;
      setLeaving(false);

      setMessage(
        "Nie udało się opuścić pokoju."
      );
    }
  }

  // ========================================
  // ZMIANA GOTOWOŚCI
  // ========================================

  async function toggleReady() {
    if (!room || !me || busy || leaving || isPlaying) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      await setPlayerReady(room.id, !me.ready);
      setRoom(await loadRoom(room.id));
    } catch (error) {
      console.error(
        "CityRoll — gotowość:",
        error
      );

      setMessage(
        "Nie udało się zmienić gotowości."
      );
    } finally {
      setBusy(false);
    }
  }

  // ========================================
  // KOPIOWANIE KODU
  // ========================================

  async function copyCode() {
    if (!room) return;

    try {
      await navigator.clipboard.writeText(
        room.code
      );

      setMessage("Kod pokoju skopiowany!");
    } catch {
      setMessage(
        "Nie udało się skopiować kodu."
      );
    }
  }

  // ========================================
  // UDOSTĘPNIANIE POKOJU
  // ========================================

  async function shareRoom() {
    if (!room) return;

    const url = new URL(
      "/",
      window.location.origin
    );

    url.searchParams.set(
      "room",
      room.code
    );

    try {
      if (navigator.share) {
        await navigator.share({
          title: "CityRoll",
          text: `Dołącz do CityRoll! Kod: ${room.code}`,
          url: url.toString(),
        });
      } else {
        await navigator.clipboard.writeText(
          url.toString()
        );

        setMessage(
          "Link zaproszenia skopiowany!"
        );
      }
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        return;
      }

      setMessage(
        "Nie udało się udostępnić zaproszenia."
      );
    }
  }

  // ========================================
  // ROZPOCZĘCIE GRY
  // ========================================

  async function handleStart() {
    if (!room || !canStart || busy || leaving) return;

    setBusy(true);
    setMessage("");

    try {
      await startRoom(room.id);
      setRoom(await loadRoom(room.id));

      setMessage(
        "Rozgrywka rozpoczęta!"
      );
    } catch (error) {
      console.error(
        "CityRoll — start:",
        error
      );

      setMessage(
        "Nie udało się rozpocząć gry."
      );
    } finally {
      setBusy(false);
    }
  }

  // ========================================
  // EKRAN ŁADOWANIA / BŁĘDU
  // ========================================

  if (loading || !room) {
    return (
      <RoomStatusScreen
        loading={loading}
        message={loadError}
        roomCode={lastRoomCode}
      />
    );
  }

  // ========================================
  // GŁÓWNY WIDOK POCZEKALNI
  // ========================================

  return (
    <main className={styles.screen}>
      <div className={styles.container}>

        {/* NAGŁÓWEK */}
        <header className={styles.header}>
          <button
            type="button"
            className={styles.back}
            disabled={busy || leaving}
            onClick={
              isPlaying
                ? () => router.replace("/")
                : handleLeave
            }
            aria-label="Wróć"
          >
            ←
          </button>

          <h1>Poczekalnia</h1>

          <div className={styles.spacer} />
        </header>

        {/* POWITANIE */}
        <div className={styles.intro}>
          <span className={styles.dice}>
            🎲
          </span>

          <h2>Zbierz swoją ekipę!</h2>

          <p>
            Zaproś znajomych i rozpocznij rozgrywkę.
          </p>
        </div>

        {/* KOD POKOJU */}
        <section className={styles.card}>
          <p className={styles.label}>
            KOD POKOJU
          </p>

          <div className={styles.roomCode}>
            {room.code}
          </div>

          <div className={styles.shareRow}>
            <button
              type="button"
              onClick={copyCode}
            >
              Kopiuj kod
            </button>

            <button
              type="button"
              className={styles.shareButton}
              onClick={shareRoom}
            >
              ↗ Udostępnij
            </button>
          </div>
        </section>

        {/* LISTA GRACZY */}
        <section className={styles.playersSection}>
          <div className={styles.playersHeader}>
            <h2>Gracze</h2>

            <span>
              {room.players.length}/4
            </span>
          </div>

          <div className={styles.playersList}>
            {Array.from(
              { length: 4 },
              (_, index) => {
                const player = room.players[index];

                // Puste miejsce.
                if (!player) {
                  return (
                    <div
                      key={`empty-${index}`}
                      className={styles.emptyPlayer}
                    >
                      <span className={styles.emptyIcon}>
                        +
                      </span>

                      Oczekiwanie na gracza...
                    </div>
                  );
                }

                const playerIsHost =
                  player.user_id === room.host_id;

                // Sprawdzamy aktywność gracza.
                const online =
                  currentTime === null ||
                  isPlayerOnline(
                    player.last_seen_at,
                    currentTime
                  );

                return (
                  <div
                    key={player.user_id}
                    className={styles.player}
                  >
                    <div className={styles.pawnBox}>
                      <PawnIcon
                        color={player.pawn}
                      />
                    </div>

                    <div className={styles.playerInfo}>
                      <strong>
                        {player.nickname}

                        {playerIsHost && (
                          <span className={styles.host}>
                            HOST
                          </span>
                        )}
                      </strong>

                      <small>
                        {!online
                          ? "Offline — czekamy na powrót"
                          : player.ready
                            ? "Gotowy do gry"
                            : "Przygotowuje się..."}
                      </small>
                    </div>

                    <span
                      className={styles.status}
                      title={
                        online
                          ? "Online"
                          : "Offline"
                      }
                      style={{
                        background: !online
                          ? "#B6BFCE"
                          : player.ready
                            ? "#43C79B"
                            : "#E5B967",
                      }}
                    />
                  </div>
                );
              }
            )}
          </div>

          <p className={styles.readyCount}>
            Gotowi: {readyCount}/{room.players.length}
          </p>
        </section>

        {/* PRZYCISKI */}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.readyButton}
            disabled={
              busy ||
              leaving ||
              isPlaying ||
              !me
            }
            onClick={toggleReady}
          >
            {isPlaying
              ? "Rozgrywka rozpoczęta"
              : me?.ready
                ? "✓ Jesteś gotowy"
                : "○ Jestem gotowy"}
          </button>

          <button
            type="button"
            className={styles.startButton}
            disabled={
              !canStart ||
              busy ||
              leaving
            }
            onClick={handleStart}
          >
            {isPlaying
              ? "Gra rozpoczęta"
              : isHost
                ? "Rozpocznij grę"
                : "Czekamy na hosta"}
          </button>

          {!isPlaying && (
            <button
              type="button"
              className={styles.leaveButton}
              disabled={busy || leaving}
              onClick={handleLeave}
            >
              {leaving
                ? "Opuszczanie pokoju..."
                : "Opuść pokój"}
            </button>
          )}

          {connectionMessage && (
            <p
              className={styles.message}
              role="status"
            >
              {connectionMessage}
            </p>
          )}

          {message && (
            <p
              className={styles.message}
              role="status"
            >
              {message}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
