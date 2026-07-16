"use client";

import { useState } from "react";
import {
  CardDeck,
  ChallengeCard,
  ChoiceGrid,
  ClueList,
  DrawingCanvas,
  GameButton,
  GameHeader,
  GameSurface,
  GameTimer,
  OutcomeBanner,
  PlayerStrip,
  PromptCard,
  RevealPanel,
  RoundTracker,
  ScoreBoard,
  TeamBoard,
  TextAnswer,
  TurnIndicator,
  gameThemeList,
  gameThemes,
  type GameThemeName,
  type SketchStroke,
} from "../../components/game-ui";
import styles from "./component-lab.module.css";

const deck = [
  { id: "mime", label: "Make them guess without speaking", detail: "Act out a cult movie for your team.", icon: "🎬" },
  { id: "sound", label: "Sound imitation", detail: "Make them recognize an object using sound alone.", icon: "🔊" },
  { id: "story", label: "Flash story", detail: "Invent an ending in fewer than three sentences.", icon: "📖" },
];

const choices = [
  { id: "ocean", label: "At the bottom of the ocean", description: "Mysterious and contemplative", icon: "🌊" },
  { id: "space", label: "Inside a space station", description: "Fast and spectacular", icon: "🪐" },
  { id: "forest", label: "Inside a magical forest", description: "Poetic and surprising", icon: "🌿" },
  { id: "city", label: "Inside a futuristic city", description: "Electric and competitive", icon: "🌃" },
];

export default function ComponentLabPage() {
  const [theme, setTheme] = useState<GameThemeName>("tropical");
  const [deckIndex, setDeckIndex] = useState(0);
  const [choice, setChoice] = useState("forest");
  const [answer, setAnswer] = useState("");
  const [strokes, setStrokes] = useState<SketchStroke[]>([]);
  const [revealed, setRevealed] = useState(false);
  const activeTheme = gameThemes[theme];

  return (
    <GameSurface theme={theme} className={styles.lab}>
      <nav className={styles.nav}>
        <a href="/" className={styles.back}>← BoardForge</a>
        <span>Component Lab</span>
      </nav>

      <section className={styles.intro}>
        <div>
          <span>Generic library</span>
          <h1>Game building blocks,<br />not predefined games.</h1>
          <p>AI can assemble these components and give them a visual mood. The selector below applies the same <code>theme</code> parameter to the entire page.</p>
        </div>
        <div className={styles.activeTheme}>
          <b>{activeTheme.emoji}</b>
          <span>Active theme</span>
          <strong>{activeTheme.name}</strong>
          <p>{activeTheme.description}</p>
        </div>
      </section>

      <section className={styles.themePicker} aria-labelledby="theme-title">
        <div className={styles.sectionTitle}>
          <div><span>01</span><h2 id="theme-title">20 themes ready to customize</h2></div>
          <code>{`theme="${theme}"`}</code>
        </div>
        <div className={styles.themeGrid}>
          {gameThemeList.map((item) => (
            <button className={theme === item.id ? styles.selectedTheme : undefined} type="button" onClick={() => setTheme(item.id as GameThemeName)} aria-pressed={theme === item.id} key={item.id}>
              <span className={styles.swatches}>
                <i style={{ background: item.colors.primary }} />
                <i style={{ background: item.colors.secondary }} />
                <i style={{ background: item.colors.accent }} />
              </span>
              <b>{item.emoji}</b>
              <strong>{item.name}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.showcase} aria-labelledby="components-title">
        <div className={styles.sectionTitle}>
          <div><span>02</span><h2 id="components-title">Available components</h2></div>
          <p>Prop-driven, composable, and mobile-first.</p>
        </div>

        <div className={styles.fullWidth}>
          <label>GameHeader</label>
          <GameHeader
            theme={theme}
            eyebrow="Quick challenge · Round 2"
            title="The Festival of Worlds"
            description="A game interface whose content and visual mood come from the GameSpec."
            icon={activeTheme.emoji}
            actions={<GameButton theme={theme}>Start</GameButton>}
          />
        </div>

        <div className={styles.gameStatusGrid}>
          <div><label>TurnIndicator</label><TurnIndicator theme={theme} player="Camille" instruction="Make your team guess the card" avatar="CA" /></div>
          <div><label>RoundTracker</label><RoundTracker theme={theme} current={2} total={4} /></div>
          <div><label>GameTimer</label><GameTimer theme={theme} seconds={42} totalSeconds={60} /></div>
        </div>

        <div className={styles.mainGrid}>
          <div className={styles.spanTwo}>
            <label>PromptCard</label>
            <PromptCard theme={theme} category="Mime · Movies" prompt="Make them guess Back to the Future without speaking." hint="You may use any objects around you." footer={<><GameTimer theme={theme} seconds={42} totalSeconds={60} /><GameButton theme={theme} variant="secondary">Pass</GameButton></>} icon="🎬" />
          </div>
          <div>
            <label>CardDeck</label>
            <CardDeck theme={theme} cards={deck} activeIndex={deckIndex} onDraw={() => setDeckIndex((index) => Math.min(index + 1, deck.length))} />
          </div>
        </div>

        <div className={styles.fullWidth}>
          <label>ChoiceGrid</label>
          <ChoiceGrid theme={theme} choices={choices} selectedId={choice} onSelect={setChoice} />
        </div>

        <div className={styles.twoColumns}>
          <div><label>TextAnswer</label><TextAnswer theme={theme} value={answer} onChange={setAnswer} placeholder="Your suggestion…" /></div>
          <div><label>PlayerStrip</label><PlayerStrip theme={theme} activePlayerId="camille" players={[{ id: "camille", name: "Camille", status: "playing", avatar: "CA" }, { id: "yanis", name: "Yanis", status: "ready", avatar: "YA" }, { id: "lea", name: "Lea", status: "ready", avatar: "LE" }, { id: "noah", name: "Noah", avatar: "NO" }]} /></div>
        </div>

        <div className={styles.twoColumns}>
          <div><label>TeamBoard</label><TeamBoard theme={theme} activeTeamId="sun" teams={[{ id: "sun", name: "The Comets", score: 7, members: ["Camille", "Noah"], icon: "☄️" }, { id: "moon", name: "The Fireflies", score: 5, members: ["Lea", "Yanis"], icon: "✨" }]} /></div>
          <div><label>ScoreBoard</label><ScoreBoard theme={theme} entries={[{ id: "sun", label: "The Comets", score: 7, detail: "3 challenges won", icon: "☄️" }, { id: "moon", label: "The Fireflies", score: 5, detail: "2 challenges won", icon: "✨" }, { id: "star", label: "The Stars", score: 3, detail: "1 challenge won", icon: "⭐" }]} /></div>
        </div>

        <div className={styles.twoColumns}>
          <div><label>ClueList</label><ClueList theme={theme} revealed={2} clues={["Families often watch it together", "He travels through time", "He drives a very special car"]} /></div>
          <div><label>ChallengeCard</label><ChallengeCard theme={theme} title="One-minute mime" instruction="Make them recognize three objects in the room without saying a word." difficulty="hard" reward="3 points" icon="🎭"><GameButton theme={theme}>Start challenge</GameButton></ChallengeCard></div>
        </div>

        <div className={styles.twoColumns}>
          <div><label>DrawingCanvas</label><DrawingCanvas theme={theme} strokes={strokes} onChange={setStrokes} /></div>
          <div><label>RevealPanel</label><RevealPanel theme={theme} revealed={revealed} onReveal={() => setRevealed(true)} title="Back to the Future" description="Well played! The team earns two points." icon="🚗" /></div>
        </div>

        <div className={styles.fullWidth}>
          <label>OutcomeBanner</label>
          <OutcomeBanner theme={theme} status="success" title="Challenge complete!" description="The Comets take the lead." stats={[{ label: "Points", value: "+2" }, { label: "Time", value: "18s" }]} actions={<GameButton theme={theme} variant="secondary">Next round →</GameButton>} />
        </div>
      </section>
    </GameSurface>
  );
}
