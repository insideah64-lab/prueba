/** @jsx jsx */
/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { jsx } from "hono/jsx";
import Groq from "groq-sdk";
import { writeFileSync, readFileSync, existsSync } from "fs";

const app = new Hono();

// Initialize Groq client
const groq = new Groq({
  apiKey: Bun.env.GROQ_API_KEY || "",
});

// Database for persistence
const SAVE_PATH = "/tmp/aethelraed_saves.json";

interface Item {
  name: string;
  type: "arma" | "armadura" | "material" | "consumible";
  rarity: "Común" | "Raro" | "Épico" | "Único";
  stats: Record<string, number>;
  quantity?: number;
}

interface GameState {
  playerName: string;
  playerClass: string;
  playerJob: string;
  hp: number;
  maxHp: number;
  classLvl: number;
  jobLvl: number;
  classXp: number;
  jobXp: number;
  gold: number;
  experience: number;
  location: string;
  equipment: Record<string, Item | null>;
  inventory: Item[];
  log: string[];
  isAlive: boolean;
  skills: string[];
  factionRep: Record<string, number>;
  hungerThirst: { hunger: number; thirst: number };
  stats: Record<string, number>;
  backstory: string;
  sessionId: string;
}

let gameState: GameState | null = null;

const defaultStats = {
  Fuerza: 8,
  Agilidad: 8,
  Inteligencia: 8,
  Resistencia: 8,
  Suerte: 8,
};

const initializeGame = (name: string): GameState => ({
  playerName: name,
  playerClass: "Guerrero",
  playerJob: "Aprendiz",
  hp: 100,
  maxHp: 100,
  classLvl: 1,
  jobLvl: 1,
  classXp: 0,
  jobXp: 0,
  gold: 50,
  experience: 0,
  location: "Taberna del Óxido",
  equipment: {
    weapon: null,
    armor: null,
    head: null,
    accessory: null,
  },
  inventory: [
    {
      name: "Daga de Hierro",
      type: "arma",
      rarity: "Común",
      stats: { ataque: 5 },
      quantity: 1,
    },
    {
      name: "Jubón de Cuero",
      type: "armadura",
      rarity: "Común",
      stats: { defensa: 3 },
      quantity: 1,
    },
  ],
  log: [],
  isAlive: true,
  skills: [],
  factionRep: {
    "Barones del Plomo": 0,
    "Culto del Óxido": 0,
  },
  hungerThirst: { hunger: 0, thirst: 0 },
  stats: defaultStats,
  backstory: "",
  sessionId: Math.random().toString(36).substring(7),
});

// Save/Load functions
function saveGame(state: GameState) {
  const saves = loadAllSaves();
  saves[state.sessionId] = state;
  writeFileSync(SAVE_PATH, JSON.stringify(saves, null, 2));
}

function loadAllSaves(): Record<string, GameState> {
  if (!existsSync(SAVE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(SAVE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

// AI Interpreter for free-form actions
async function interpretAction(
  action: string,
  state: GameState
): Promise<{
  narrative: string;
  hpChange: number;
  xpChange: number;
  itemsGained: Item[];
}> {
  if (!Bun.env.GROQ_API_KEY) {
    return {
      narrative: "La IA está offline. Intenta luego.",
      hpChange: 0,
      xpChange: 0,
      itemsGained: [],
    };
  }

  try {
    const systemPrompt = `Eres el árbitro de un MUD llamado Aethelraed: Infinity Engine. 
 El jugador acaba de hacer una acción: "${action}"

 Contexto del mundo:
 - Nombre: ${state.playerName}
 - Clase: ${state.playerClass} (Nivel ${state.classLvl})
 - Oficio: ${state.playerJob} (Nivel ${state.jobLvl})
 - Ubicación: ${state.location}
 - HP: ${state.hp}/${state.maxHp}
 - Atributos: ${JSON.stringify(state.stats)}

 INSTRUCCIONES:
 1. Interpreta la acción del jugador de forma narrativa y creativa
 2. Decide el impacto mecánico: daño recibido, experiencia ganada, ítems encontrados
 3. Mantén un tono gótico, oscuro y épico
 4. Responde en ESPAÑOL
 5. Sé breve (máximo 3 líneas de narrativa)

 RESPONDE EN ESTE FORMATO EXACTO (JSON):
 {
   "narrative": "Descripción épica de lo que pasó",
   "hpChange": -10,
   "xpChange": 25,
   "itemsGained": [{"name": "Esencia de Óxido", "type": "material", "rarity": "Raro", "stats": {}}]
 }

 Recuerda: hpChange negativo = daño. xpChange es experiencia ganada. itemsGained puede estar vacío.`;

    const response = await groq.messages.create({
      model: "mixtral-8x7b-32768",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: systemPrompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type === "text") {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          narrative: result.narrative || "Algo sucedió...",
          hpChange: result.hpChange || 0,
          xpChange: result.xpChange || 0,
          itemsGained: result.itemsGained || [],
        };
      }
    }
  } catch (error) {
    console.error("Groq error:", error);
  }

  return {
    narrative: "El silencio envuelve tu acción. Algo sucede, pero no logras verlo claramente.",
    hpChange: 0,
    xpChange: 10,
    itemsGained: [],
  };
}

// ===== RUTAS =====
app.get("/", (c) => {
  return c.html(
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Aethelraed MUD</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>{`
          .mud-log {
            font-family: 'Courier New', monospace;
            background: #0a0e27;
            color: #00d084;
            border: 1px solid #1a2332;
          }
          .mud-log p {
            margin: 4px 0;
            line-height: 1.4;
            word-wrap: break-word;
          }
          .mud-input {
            background: #0a0e27;
            color: #00d084;
            border: 1px solid #1a2332;
            font-family: 'Courier New', monospace;
          }
          .mud-header {
            background: linear-gradient(135deg, #1a1f3a 0%, #2d1b4e 100%);
            border-bottom: 2px solid #3d2e5f;
          }
          .stat-bar {
            background: #1a2332;
            border-radius: 4px;
            overflow: hidden;
            height: 16px;
          }
          .stat-fill {
            background: linear-gradient(90deg, #00d084 0%, #00f0a9 100%);
            height: 100%;
            transition: width 0.3s ease;
          }
          .neon-text {
            text-shadow: 0 0 10px rgba(0, 208, 132, 0.8);
          }
          .loading {
            animation: pulse 1s infinite;
          }
          @keyframes pulse {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 1; }
          }
          .stat-item {
            font-size: 11px;
            display: flex;
            justify-content: space-between;
          }
          .skill-tag {
            display: inline-block;
            background: #1a2f2a;
            border: 1px solid #00d084;
            padding: 2px 6px;
            margin: 2px;
            border-radius: 3px;
            font-size: 10px;
          }
        `}</style>
      </head>
      <body class="bg-gray-950 text-gray-100">
        <div id="app" class="min-h-screen flex flex-col">
          <div class="mud-header p-4 shadow-lg">
            <h1 class="text-3xl font-bold neon-text mb-1">
              ⚔️ Aethelraed: Infinity Engine
            </h1>
            <p class="text-xs text-gray-400">
              Escribe tus acciones libremente. La IA interpreta tu destino.
            </p>
          </div>

          <div class="flex-1 flex gap-3 p-3 max-w-full mx-auto w-full">
            {/* Main Game Area */}
            <div class="flex-1 flex flex-col gap-3">
              {/* Game Log */}
              <div class="mud-log rounded p-3 flex-1 overflow-y-auto">
                <div id="gameLog">
                  <p class="text-yellow-400 text-sm">
                    [Conectando con el Motor del Infinito...]
                  </p>
                </div>
              </div>

              {/* Input */}
              <div class="flex gap-2">
                <textarea
                  id="commandInput"
                  placeholder="Escribe tu acción libremente (ej: 'ataco al monstruo con toda mi fuerza', 'busco oro en las ruinas', 'intento seducir al NPC')..."
                  class="flex-1 mud-input px-3 py-2 rounded text-sm"
                  rows="2"
                ></textarea>
                <button
                  id="sendBtn"
                  class="px-4 py-2 bg-green-700 hover:bg-green-600 rounded font-bold transition text-sm"
                >
                  Ejecutar
                </button>
              </div>
            </div>

            {/* Sidebar: Character Stats */}
            <div class="w-80 flex flex-col gap-2 overflow-y-auto max-h-full">
              {/* Character Info */}
              <div class="bg-gray-900 border border-gray-700 rounded p-3">
                <h2 class="text-lg font-bold mb-2 neon-text">
                  {gameState?.playerName || "Personaje"}
                </h2>

                <div class="space-y-1 text-xs">
                  <div class="flex justify-between">
                    <span class="text-gray-500">Clase:</span>
                    <span id="playerClass" class="font-bold text-blue-400">
                      {gameState?.playerClass || "---"}
                    </span>
                  </div>

                  <div class="flex justify-between">
                    <span class="text-gray-500">Oficio:</span>
                    <span id="playerJob" class="font-bold text-purple-400">
                      {gameState?.playerJob || "---"}
                    </span>
                  </div>

                  <div class="flex justify-between">
                    <span class="text-gray-500">Ubicación:</span>
                    <span id="location" class="font-bold text-cyan-400">
                      {gameState?.location || "---"}
                    </span>
                  </div>
                </div>
              </div>

              {/* HP Bar */}
              <div class="bg-gray-900 border border-gray-700 rounded p-3">
                <label class="text-gray-500 text-xs block mb-1">Vitalidad</label>
                <div class="stat-bar mb-1">
                  <div
                    id="hpFill"
                    class="stat-fill"
                    style="width: 100%"
                  ></div>
                </div>
                <p id="hpText" class="text-xs text-gray-400">
                  {gameState?.hp || 0} / {gameState?.maxHp || 100}
                </p>
              </div>

              {/* Levels */}
              <div class="bg-gray-900 border border-gray-700 rounded p-3">
                <div class="space-y-2 text-xs">
                  <div>
                    <div class="flex justify-between mb-1">
                      <span class="text-gray-500">Clase</span>
                      <span id="classLvl">Lv. {gameState?.classLvl || 1}</span>
                    </div>
                    <div class="stat-bar">
                      <div
                        id="classXpFill"
                        class="stat-fill bg-blue-500"
                        style="width: 0%"
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div class="flex justify-between mb-1">
                      <span class="text-gray-500">Oficio</span>
                      <span id="jobLvl">Lv. {gameState?.jobLvl || 1}</span>
                    </div>
                    <div class="stat-bar">
                      <div
                        id="jobXpFill"
                        class="stat-fill bg-purple-500"
                        style="width: 0%"
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Atributos */}
              <div class="bg-gray-900 border border-gray-700 rounded p-3">
                <h3 class="font-bold mb-2 text-xs">Atributos</h3>
                <div class="space-y-1 text-xs">
                  {gameState?.stats &&
                    Object.entries(gameState.stats).map(([attr, val]) => (
                      <div key={attr} class="stat-item">
                        <span class="text-gray-500">{attr}:</span>
                        <span class="text-green-400 font-bold">{val}</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Resources */}
              <div class="bg-gray-900 border border-gray-700 rounded p-3">
                <h3 class="font-bold mb-2 text-xs">Recursos</h3>
                <div class="space-y-1 text-xs">
                  <div class="flex justify-between">
                    <span class="text-gray-500">Oro:</span>
                    <span id="gold" class="text-yellow-400 font-bold">
                      {gameState?.gold || 0}
                    </span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">Exp:</span>
                    <span id="exp" class="text-green-400 font-bold">
                      {gameState?.experience || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Skills */}
              {gameState?.skills && gameState.skills.length > 0 && (
                <div class="bg-gray-900 border border-gray-700 rounded p-3">
                  <h3 class="font-bold mb-2 text-xs">Habilidades</h3>
                  <div id="skillsList">
                    {gameState.skills.map((skill) => (
                      <span key={skill} class="skill-tag">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Inventory */}
              <div class="bg-gray-900 border border-gray-700 rounded p-3">
                <h3 class="font-bold mb-2 text-xs">Inventario ({gameState?.inventory.length || 0})</h3>
                <div id="inventoryList" class="space-y-1 text-xs max-h-48 overflow-y-auto">
                  {gameState?.inventory.map((item, idx) => (
                    <div key={idx} class="flex justify-between text-gray-400 border-b border-gray-700 pb-1">
                      <span>{item.name} x{item.quantity || 1}</span>
                      <span class="text-cyan-400">{item.rarity}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Factions */}
              <div class="bg-gray-900 border border-gray-700 rounded p-3">
                <h3 class="font-bold mb-2 text-xs">Facciones</h3>
                <div id="factionList" class="space-y-1 text-xs">
                  {gameState?.factionRep &&
                    Object.entries(gameState.factionRep).map(([faction, rep]) => (
                      <div key={faction} class="flex justify-between">
                        <span class="text-gray-500">{faction}:</span>
                        <span
                          class={
                            rep > 0
                              ? "text-green-400"
                              : rep < 0
                                ? "text-red-400"
                                : "text-gray-400"
                          }
                        >
                          {rep > 0 ? "+" : ""}{rep}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <script>
          {`
            let playerName = null;

            async function initGame() {
              const name = prompt("¿Cuál es tu nombre, viajero?", "Darian");
              if (name) {
                playerName = name;
                const res = await fetch("/api/init", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name }),
                });
                const data = await res.json();
                updateUI(data);
              }
            }

            async function sendCommand() {
              const input = document.getElementById("commandInput");
              const btn = document.getElementById("sendBtn");
              const action = input.value.trim();
              if (!action) return;

              btn.disabled = true;
              btn.classList.add("loading");
              input.disabled = true;
              btn.textContent = "Procesando...";

              const res = await fetch("/api/action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
              });
              const data = await res.json();
              updateUI(data);
              input.value = "";
              input.focus();
              
              btn.disabled = false;
              btn.classList.remove("loading");
              btn.textContent = "Ejecutar";
              input.disabled = false;
            }

            function updateUI(state) {
              document.getElementById("playerClass").textContent = state.playerClass;
              document.getElementById("playerJob").textContent = state.playerJob;
              document.getElementById("classLvl").textContent = "Lv. " + state.classLvl;
              document.getElementById("jobLvl").textContent = "Lv. " + state.jobLvl;
              document.getElementById("location").textContent = state.location;
              document.getElementById("gold").textContent = state.gold;
              document.getElementById("exp").textContent = state.experience;

              const hpPercent = (state.hp / state.maxHp) * 100;
              document.getElementById("hpFill").style.width = hpPercent + "%";
              document.getElementById("hpText").textContent = state.hp + " / " + state.maxHp;

              const classXpPercent = (state.classXp / (state.classLvl * 100)) * 100;
              document.getElementById("classXpFill").style.width = Math.min(classXpPercent, 100) + "%";

              const jobXpPercent = (state.jobXp / (state.jobLvl * 100)) * 100;
              document.getElementById("jobXpFill").style.width = Math.min(jobXpPercent, 100) + "%";

              const log = document.getElementById("gameLog");
              log.innerHTML = state.log.map(msg => \`<p class="text-xs">\${msg}</p>\`).join("");
              log.scrollTop = log.scrollHeight;
            }

            document.getElementById("sendBtn").addEventListener("click", sendCommand);
            document.getElementById("commandInput").addEventListener("keypress", (e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendCommand();
              }
            });

            initGame();
          `}
        </script>
      </body>
    </html>
  );
});

// API endpoint: Initialize game
app.post("/api/init", async (c) => {
  const { name } = await c.req.json();
  gameState = initializeGame(name);

  gameState.log.push(
    "═══════════════════════════════════════════════════════════"
  );
  gameState.log.push("🌑 Bienvenido a Aethelraed: Infinity Engine 🌑");
  gameState.log.push(`Tu nombre es: ${name}`);
  gameState.log.push("El mundo está envuelto en óxido y corrupción.");
  gameState.log.push("Escribe tus acciones libremente. La IA interpretará tu destino.");
  gameState.log.push(
    "═══════════════════════════════════════════════════════════"
  );
  gameState.log.push("Despiertas en la Taberna del Óxido...");

  saveGame(gameState);
  return c.json(gameState);
});

// API endpoint: Process free-form action
app.post("/api/action", async (c) => {
  if (!gameState) {
    return c.json({ error: "Game not initialized" }, 400);
  }

  if (!gameState.isAlive) {
    gameState.log.push("💀 Estás muerto. Tu aventura ha terminado.");
    return c.json(gameState);
  }

  const { action } = await c.req.json();

  // Interpret action with AI
  const result = await interpretAction(action, gameState);

  // Apply results to game state
  gameState.log.push(`> ${action}`);
  gameState.log.push(`✨ ${result.narrative}`);

  gameState.hp = Math.max(0, gameState.hp + result.hpChange);
  gameState.experience += result.xpChange;
  gameState.classXp += Math.floor(result.xpChange * 0.6);
  gameState.jobXp += Math.floor(result.xpChange * 0.4);

  // Check level ups
  if (gameState.classXp >= gameState.classLvl * 100) {
    gameState.classLvl++;
    gameState.classXp = 0;
    gameState.maxHp += 20;
    gameState.hp = gameState.maxHp;
    gameState.log.push(
      `🌟 ¡ASCENSIÓN DE CLASE! Ahora eres ${gameState.playerClass} Nivel ${gameState.classLvl}`
    );
  }

  if (gameState.jobXp >= gameState.jobLvl * 100) {
    gameState.jobLvl++;
    gameState.jobXp = 0;
    gameState.log.push(
      `🎯 ¡MAESTRÍA PROFESIONAL! Tu oficio de ${gameState.playerJob} es ahora Nivel ${gameState.jobLvl}`
    );
  }

  // Add items
  for (const item of result.itemsGained) {
    gameState.inventory.push(item);
    gameState.log.push(`📦 Obtuviste: ${item.name} (${item.rarity})`);
  }

  // Check death
  if (gameState.hp === 0) {
    gameState.isAlive = false;
    gameState.log.push("💀 Has caído. Tu legado permanece en el Velo...");
  }

  // Random world events
  if (Math.random() < 0.1) {
    const events = [
      "Una niebla errante desciende sobre la zona...",
      "Escuchas un grito lejano en la oscuridad...",
      "El suelo tiembla bajo tus pies...",
      "Una sombra misteriosa cruza tu camino...",
    ];
    gameState.log.push(
      `⚠️ ${events[Math.floor(Math.random() * events.length)]}`
    );
  }

  saveGame(gameState);
  return c.json(gameState);
});

export default app;
