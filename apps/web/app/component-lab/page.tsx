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
  { id: "mime", label: "Faire deviner sans parler", detail: "Mimez un film culte à votre équipe.", icon: "🎬" },
  { id: "sound", label: "Imitation sonore", detail: "Faites reconnaître un objet uniquement par le son.", icon: "🔊" },
  { id: "story", label: "Histoire éclair", detail: "Inventez une fin en moins de trois phrases.", icon: "📖" },
];

const choices = [
  { id: "ocean", label: "Au fond de l'océan", description: "Mystérieux et contemplatif", icon: "🌊" },
  { id: "space", label: "Dans une station spatiale", description: "Rapide et spectaculaire", icon: "🪐" },
  { id: "forest", label: "Dans une forêt magique", description: "Poétique et surprenant", icon: "🌿" },
  { id: "city", label: "Dans une ville futuriste", description: "Électrique et compétitif", icon: "🌃" },
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
          <span>Bibliothèque générique</span>
          <h1>Des briques de jeu,<br />pas des jeux prédéfinis.</h1>
          <p>L'IA pourra assembler ces composants et leur transmettre une ambiance. Le sélecteur ci-dessous applique exactement le même paramètre <code>theme</code> à toute la page.</p>
        </div>
        <div className={styles.activeTheme}>
          <b>{activeTheme.emoji}</b>
          <span>Ambiance active</span>
          <strong>{activeTheme.name}</strong>
          <p>{activeTheme.description}</p>
        </div>
      </section>

      <section className={styles.themePicker} aria-labelledby="theme-title">
        <div className={styles.sectionTitle}>
          <div><span>01</span><h2 id="theme-title">20 ambiances prêtes à paramétrer</h2></div>
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
          <div><span>02</span><h2 id="components-title">Composants disponibles</h2></div>
          <p>Contrôlés par propriétés, combinables et mobile-first.</p>
        </div>

        <div className={styles.fullWidth}>
          <label>GameHeader</label>
          <GameHeader
            theme={theme}
            eyebrow="Défi express · Manche 2"
            title="Le Festival des Mondes"
            description="Une interface de partie dont le contenu et l'ambiance viennent de la GameSpec."
            icon={activeTheme.emoji}
            actions={<GameButton theme={theme}>Commencer</GameButton>}
          />
        </div>

        <div className={styles.gameStatusGrid}>
          <div><label>TurnIndicator</label><TurnIndicator theme={theme} player="Camille" instruction="Fais deviner la carte à ton équipe" avatar="CA" /></div>
          <div><label>RoundTracker</label><RoundTracker theme={theme} current={2} total={4} /></div>
          <div><label>GameTimer</label><GameTimer theme={theme} seconds={42} totalSeconds={60} /></div>
        </div>

        <div className={styles.mainGrid}>
          <div className={styles.spanTwo}>
            <label>PromptCard</label>
            <PromptCard theme={theme} category="Mime · Cinéma" prompt="Fais deviner Retour vers le futur sans parler." hint="Tu peux utiliser tous les objets autour de toi." footer={<><GameTimer theme={theme} seconds={42} totalSeconds={60} /><GameButton theme={theme} variant="secondary">Passer</GameButton></>} icon="🎬" />
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
          <div><label>TextAnswer</label><TextAnswer theme={theme} value={answer} onChange={setAnswer} placeholder="Votre proposition…" /></div>
          <div><label>PlayerStrip</label><PlayerStrip theme={theme} activePlayerId="camille" players={[{ id: "camille", name: "Camille", status: "playing", avatar: "CA" }, { id: "yanis", name: "Yanis", status: "ready", avatar: "YA" }, { id: "lea", name: "Léa", status: "ready", avatar: "LÉ" }, { id: "noah", name: "Noah", avatar: "NO" }]} /></div>
        </div>

        <div className={styles.twoColumns}>
          <div><label>TeamBoard</label><TeamBoard theme={theme} activeTeamId="sun" teams={[{ id: "sun", name: "Les Comètes", score: 7, members: ["Camille", "Noah"], icon: "☄️" }, { id: "moon", name: "Les Lucioles", score: 5, members: ["Léa", "Yanis"], icon: "✨" }]} /></div>
          <div><label>ScoreBoard</label><ScoreBoard theme={theme} entries={[{ id: "sun", label: "Les Comètes", score: 7, detail: "3 défis réussis", icon: "☄️" }, { id: "moon", label: "Les Lucioles", score: 5, detail: "2 défis réussis", icon: "✨" }, { id: "star", label: "Les Étoiles", score: 3, detail: "1 défi réussi", icon: "⭐" }]} /></div>
        </div>

        <div className={styles.twoColumns}>
          <div><label>ClueList</label><ClueList theme={theme} revealed={2} clues={["On le regarde souvent en famille", "Il voyage dans le temps", "Il conduit une voiture très spéciale"]} /></div>
          <div><label>ChallengeCard</label><ChallengeCard theme={theme} title="Mime minute" instruction="Fais reconnaître trois objets présents dans la pièce sans prononcer un mot." difficulty="hard" reward="3 points" icon="🎭"><GameButton theme={theme}>Lancer le défi</GameButton></ChallengeCard></div>
        </div>

        <div className={styles.twoColumns}>
          <div><label>DrawingCanvas</label><DrawingCanvas theme={theme} strokes={strokes} onChange={setStrokes} /></div>
          <div><label>RevealPanel</label><RevealPanel theme={theme} revealed={revealed} onReveal={() => setRevealed(true)} title="Retour vers le futur" description="Bien joué ! L'équipe remporte deux points." icon="🚗" /></div>
        </div>

        <div className={styles.fullWidth}>
          <label>OutcomeBanner</label>
          <OutcomeBanner theme={theme} status="success" title="Défi réussi !" description="Les Comètes prennent la tête." stats={[{ label: "Points", value: "+2" }, { label: "Temps", value: "18s" }]} actions={<GameButton theme={theme} variant="secondary">Manche suivante →</GameButton>} />
        </div>
      </section>
    </GameSurface>
  );
}
