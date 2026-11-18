
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./Home.module.css";

import {
  createRoom,
  joinRoom,
  type PawnColor,
} from "../lib/rooms";

import {
  getRoomAvailability,
  type RoomAvailability,
} from "../lib/roomAvailability";

// ==========================================
// CITYROLL — EKRAN STARTOWY
// ==========================================

const PAWNS: {
  id: PawnColor;
  name: string;
  color: string;
  dark: string;
}[] = [
  {
    id: "purple",
    name: "Fioletowy",
    color: "#9B77F5",
    dark: "#7352DB",
  },
  {
    id: "blue",
    name: "Niebieski",
    color: "#58A5F7",
    dark: "#3079CE",
  },
  {
    id: "green",
    name: "Zielony",
    color: "#54C9A4",
    dark: "#299F7D",
  },
  {
    id: "orange",
    name: "Pomarańczowy",
    color: "#FFAB66",
    dark: "#EA8337",
  },
];

// ==========================================
// LOGO CITYROLL
// ==========================================

function Logo() {
  return (
    <header className={styles.header}>
      <div className={styles.logoRow}>
        <svg
          className={styles.logoIcon}
          viewBox="0 0 74 74"
          aria-hidden="true"
        >
          <rect
            width="74"
            height="74"
            rx="20"
            fill="#8C76F5"
          />

          <rect
            x="13"
            y="30"
            width="16"
            height="27"
            rx="3"
            fill="white"
          />

          <rect
            x="29"
            y="16"
            width="18"
            height="41"
            rx="3"
            fill="white"
          />

          <rect
            x="47"
            y="35"
            width="14"
            height="22"
            rx="3"
            fill="white"
          />

          <g fill="#8C76F5">
            <rect x="18" y="36" width="4" height="4" rx="1" />
            <rect x="18" y="44" width="4" height="4" rx="1" />
            <rect x="35" y="23" width="5" height="5" rx="1" />
          </g>

          <g transform="translate(37 41) rotate(-12)">
            <rect
              width="23"
              height="23"
              rx="6"
              fill="white"
              stroke="#E4DEFF"
            />

            <circle cx="7" cy="7" r="2.5" fill="#8C76F5" />
            <circle cx="16" cy="16" r="2.5" fill="#8C76F5" />
          </g>
        </svg>

        <h1 className={styles.logoTitle}>
          City<span>Roll</span>
        </h1>
      </div>

      <p className={styles.subtitle}>
        TWOJE MIASTO. TWOJA GRA.
      </p>
    </header>
  );
}

// ==========================================
// KLASYCZNY PIONEK
// ==========================================

function Pawn({
  color,
  dark,
}: {
  color: string;
  dark: string;
}) {
  return (
    <svg
      viewBox="0 0 48 60"
      width="36"
      height="46"
      aria-hidden="true"
    >
      <circle cx="24" cy="13" r="10" fill={color} />

      <ellipse
        cx="20"
        cy="9"
        rx="4"
        ry="5"
        fill="white"
        opacity=".35"
      />

      <rect
        x="19"
        y="22"
        width="10"
        height="7"
        rx="2"
        fill={dark}
      />

      <path
        d="M19 27H29C30 35 34 41 38 46H10C14 41 18 35 19 27Z"
        fill={color}
      />

      <rect
        x="7"
        y="44"
        width="34"
        height="11"
        rx="5.5"
        fill={dark}
      />

      <rect
        x="9"
        y="44"
        width="30"
        height="5"
        rx="2.5"
        fill={color}
      />
    </svg>
  );
}

// ==========================================
// GŁÓWNY EKRAN
// ==========================================

export default function HomePage() {
  const router = useRouter();

  const [nickname, setNickname] = useState("");
  const [selectedPawn, setSelectedPawn] =
    useState<PawnColor>("purple");

  const [joinMode, setJoinMode] = useState(false);
  const [roomCode, setRoomCode] = useState("");

  const [availability, setAvailability] =
    useState<RoomAvailability | null>(null);

  const [checkingRoom, setCheckingRoom] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  // ========================================
  // OTWIERANIE LINKU Z ZAPROSZENIEM
  // ========================================

  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search
    );

    const code = params.get("room")?.toUpperCase() ?? "";

    if (/^[A-F0-9]{6}$/.test(code)) {
      setRoomCode(code);
      setJoinMode(true);
    }
  }, []);

  // ========================================
  // SYNCHRONIZACJA WOLNYCH PIONKÓW
  // ========================================

  useEffect(() => {
    const validCode = /^[A-F0-9]{6}$/.test(roomCode);

    if (!joinMode || !validCode) {
      setAvailability(null);
      setCheckingRoom(false);
      setAvailabilityError("");
      return;
    }

    let active = true;

    async function refreshAvailability() {
      try {
        const result = await getRoomAvailability(roomCode);

        if (!active) return;

        setAvailability(result);
        setAvailabilityError("");
      } catch (error) {
        if (!active) return;

        setAvailability(null);

        setAvailabilityError(
          error instanceof Error
            ? error.message
            : "Nie można sprawdzić pokoju."
        );
      } finally {
        if (active) setCheckingRoom(false);
      }
    }

    // Pierwsze sprawdzenie natychmiast
    setCheckingRoom(true);
    void refreshAvailability();

    // Aktualizacja co 3 sekundy
    const interval = window.setInterval(() => {
      void refreshAvailability();
    }, 3000);

    // Aktualizacja po powrocie do aplikacji
    window.addEventListener(
      "focus",
      refreshAvailability
    );

    return () => {
      active = false;
      window.clearInterval(interval);

      window.removeEventListener(
        "focus",
        refreshAvailability
      );
    };
  }, [joinMode, roomCode]);

  // Dane muszą dotyczyć AKTUALNEGO kodu.
  const currentAvailability =
    availability?.code === roomCode
      ? availability
      : null;

  const roomIsOpen = Boolean(
    currentAvailability?.found &&
    currentAvailability.status === "waiting"
  );

  const takenPawns: PawnColor[] = roomIsOpen
    ? currentAvailability?.takenPawns ?? []
    : [];

  // ========================================
  // AUTOMATYCZNY WYBÓR WOLNEGO PIONKA
  // ========================================

  useEffect(() => {
    if (!joinMode || !roomIsOpen) return;

    if (!takenPawns.includes(selectedPawn)) return;

    const firstFreePawn = PAWNS.find(
      (pawn) => !takenPawns.includes(pawn.id)
    );

    if (firstFreePawn) {
      setSelectedPawn(firstFreePawn.id);
    }
  }, [
    joinMode,
    roomIsOpen,
    availability,
    selectedPawn,
  ]);

  // ========================================
  // SPRAWDZANIE NICKU
  // ========================================

  function validNickname(): boolean {
    const name = nickname.trim();

    if (name.length < 2 || name.length > 16) {
      setMessage("Nick musi mieć od 2 do 16 znaków.");
      return false;
    }

    setMessage("");
    return true;
  }

  // ========================================
  // UTWORZENIE POKOJU
  // ========================================

  async function handleCreateRoom() {
    if (busy || !validNickname()) return;

    setBusy(true);
    setMessage("");

    try {
      const result = await createRoom(
        nickname.trim(),
        selectedPawn
      );

      router.push(`/room?id=${result.room_id}`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Nie udało się utworzyć pokoju."
      );

      setBusy(false);
    }
  }

  // ========================================
  // DOŁĄCZENIE DO POKOJU
  // ========================================

  async function handleJoinRoom() {
    if (busy || !validNickname()) return;

    if (!/^[A-F0-9]{6}$/.test(roomCode)) {
      setMessage("Wpisz poprawny kod pokoju.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      // Sprawdzamy ponownie tuż przed dołączeniem.
      const latest = await getRoomAvailability(roomCode);

      if (!latest.found) {
        throw new Error("Nie znaleziono pokoju.");
      }

      if (latest.status !== "waiting") {
        throw new Error("Rozgrywka już się rozpoczęła.");
      }

      if (latest.takenPawns.includes(selectedPawn)) {
        setAvailability(latest);
        throw new Error("Ten kolor pionka jest już zajęty.");
      }

      if (latest.takenPawns.length >= 4) {
        throw new Error("Pokój jest pełny.");
      }

      // Ostateczne sprawdzenie wykonuje Supabase.
      const result = await joinRoom(
        roomCode,
        nickname.trim(),
        selectedPawn
      );

      router.push(`/room?id=${result.room_id}`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Nie udało się dołączyć do pokoju."
      );

      setBusy(false);
    }
  }

  // ========================================
  // ZMIANA TRYBU NA DOŁĄCZANIE
  // ========================================

  function openJoinMode() {
    setJoinMode(true);
    setMessage("");
  }

  function closeJoinMode() {
    setJoinMode(false);
    setRoomCode("");
    setAvailability(null);
    setAvailabilityError("");
    setMessage("");
  }

  // ========================================
  // INFORMACJA O DOSTĘPNOŚCI
  // ========================================

  function getAvailabilityMessage(): string {
    if (roomCode.length !== 6) {
      return "Wpisz kod, aby zobaczyć wolne pionki.";
    }

    if (checkingRoom && !currentAvailability) {
      return "Sprawdzanie dostępnych pionków...";
    }

    if (availabilityError) {
      return availabilityError;
    }

    if (!currentAvailability?.found) {
      return "Nie znaleziono pokoju o takim kodzie.";
    }

    if (currentAvailability.status !== "waiting") {
      return "Rozgrywka w tym pokoju już trwa.";
    }

    const free = 4 - currentAvailability.takenPawns.length;

    if (free === 0) {
      return "Pokój jest pełny.";
    }

    return `Wolne pionki: ${free} z 4`;
  }

  const canJoin = Boolean(
    !busy &&
    roomIsOpen &&
    currentAvailability &&
    currentAvailability.takenPawns.length < 4 &&
    !takenPawns.includes(selectedPawn)
  );

  // ========================================
  // WYGLĄD EKRANU
  // ========================================

  return (
    <main className={styles.page}>
      <div className={styles.container}>

        <Logo />

        {!joinMode && (
          <div className={styles.intro}>
            <h2>Czas na rozgrywkę!</h2>
            <p>Wybierz pionek i rozpocznij grę.</p>
          </div>
        )}

        {/* KOD POKOJU — TYLKO DOŁĄCZANIE */}
        {joinMode && (
          <section className={styles.codeCard}>
            <label
              htmlFor="roomCode"
              className={styles.label}
            >
              KOD POKOJU
            </label>

            <input
              id="roomCode"
              type="text"
              value={roomCode}
              maxLength={6}
              placeholder="ABC123"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              className={`${styles.input} ${styles.codeInput}`}
              onChange={(event) => {
                const code = event.target.value
                  .toUpperCase()
                  .replace(/[^A-F0-9]/g, "");

                setRoomCode(code);
                setAvailability(null);
                setAvailabilityError("");
                setMessage("");
              }}
            />
          </section>
        )}

        {/* KARTA GRACZA */}
        <section className={styles.card}>
          <label
            htmlFor="nickname"
            className={styles.label}
          >
            TWÓJ NICK
          </label>

          <input
            id="nickname"
            type="text"
            value={nickname}
            maxLength={16}
            autoComplete="nickname"
            placeholder="Wpisz swój nick..."
            disabled={busy}
            className={styles.input}
            onChange={(event) => {
              setNickname(event.target.value);
              setMessage("");
            }}
          />

          {/* WYBÓR PIONKÓW */}
          <div className={styles.pawnSection}>
            <p className={styles.label}>
              WYBIERZ PIONEK
            </p>

            <div className={styles.pawnGrid}>
              {PAWNS.map((pawn) => {
                const isTaken =
                  joinMode && takenPawns.includes(pawn.id);

                const isSelected =
                  !isTaken && selectedPawn === pawn.id;

                return (
                  <button
                    key={pawn.id}
                    type="button"
                    aria-label={
                      isTaken
                        ? `${pawn.name} — zajęty`
                        : pawn.name
                    }
                    aria-pressed={isSelected}
                    disabled={busy || isTaken}
                    onClick={() => setSelectedPawn(pawn.id)}
                    className={[
                      styles.pawnButton,
                      isSelected ? styles.pawnSelected : "",
                      isTaken ? styles.pawnTaken : "",
                    ].join(" ")}
                    style={{
                      borderColor: isSelected
                        ? pawn.color
                        : "#E9EDF5",
                    }}
                  >
                    <Pawn
                      color={pawn.color}
                      dark={pawn.dark}
                    />

                    {isTaken && (
                      <span className={styles.takenLabel}>
                        ZAJĘTY
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {joinMode && (
              <p
                className={styles.availabilityInfo}
                role="status"
              >
                {getAvailabilityMessage()}
              </p>
            )}
          </div>
        </section>

        {/* PRZYCISKI */}
        <div className={styles.actions}>
          {!joinMode ? (
            <>
              <button
                type="button"
                className={styles.createButton}
                onClick={handleCreateRoom}
                disabled={busy}
              >
                {busy ? "Łączenie..." : "+ Utwórz pokój"}
              </button>

              <button
                type="button"
                className={styles.joinButton}
                onClick={openJoinMode}
                disabled={busy}
              >
                Dołącz do pokoju
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={styles.createButton}
                onClick={handleJoinRoom}
                disabled={!canJoin}
              >
                {busy
                  ? "Dołączanie..."
                  : "Dołącz do pokoju"}
              </button>

              <button
                type="button"
                className={styles.joinButton}
                onClick={closeJoinMode}
                disabled={busy}
              >
                ← Wróć
              </button>
            </>
          )}
        </div>

        {message && (
          <p className={styles.message} role="status">
            {message}
          </p>
        )}

        <footer className={styles.footer}>
          🎲 2–4 GRACZY
        </footer>
      </div>
    </main>
  );
}
