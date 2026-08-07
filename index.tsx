/** @jsx jsx */
/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { jsx } from "hono/jsx";

const app = new Hono();

// Game state for single player
interface GameState {
  playerName: string;
  playerJob: string;
  playerClass: string;
  hp: number;
  maxHp: number;
  classLvl: number;
  jobLvl: number;
  gold: number;
  experience: number;
  location: string;
  equipment: Record<string, string>;
  log: string[];
}

let gameState: GameState | null = null;

const initializeGame = (name: string): GameState => ({
  playerName: name,
  playerJob: "Aprendiz",
  playerClass: "Guerrero",
  hp: 100,
  maxHp: 100,
  classLvl: 1,
  jobLvl: 1,
  gold: 50,
  experience: 0,
  location: "Taberna del Óxido",
  equipment: {
    weapon: "Daga de Hierro",
    armor: "Jubón de Cuero",
  },
  log: [
    "Despiertas en la Taberna del Óxido. El mundo está cubierto por un velo de corrosión.",
    "Un barman te mira con desconfianza. ¿Qué haces aquí?",
  ],
});

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
            height: 20px;
          }
          .stat-fill {
            background: linear-gradient(90deg, #00d084 0%, #00f0a9 100%);
            height: 100%;
            transition: width 0.3s ease;
          }
          .neon-text {
            text-shadow: 0 0 10px rgba(0, 208, 132, 0.8);
          }
        `}</style>
      </head>
      <body class="bg-gray-950 text-gray-100">
        <div id="app" class="min-h-screen flex flex-col">
          <div class="mud-header p-4 shadow-lg">
            <h1 class="text-3xl font-bold neon-text mb-2">
              ⚔️ Aethelraed: Infinity Engine
            </h1>
            <p class="text-sm text-gray-400">
              Un mundo de óxido, fractales y legados perdidos
            </p>
          </div>

          <div class="flex-1 flex gap-4 p-4 max-w-7xl mx-auto w-full">
            {/* Main Game Area */}
            <div class="flex-1 flex flex-col gap-4">
              {/* Game Log */}
              <div class="mud-log rounded p-4 flex-1 overflow-y-auto max-h-96">
                <div id="gameLog">
                  <p class="text-yellow-400">
                    [Conectando con el Motor del Infinito...]
                  </p>
                </div>
              </div>

              {/* Input */}
              <div class="flex gap-2">
                <input
                  id="commandInput"
                  type="text"
                  placeholder="Escribe un comando (ej: atacar, explorar, hablar)..."
                  class="flex-1 mud-input px-3 py-2 rounded"
                  autocomplete="off"
                />
                <button
                  id="sendBtn"
                  class="px-6 py-2 bg-green-700 hover:bg-green-600 rounded font-bold transition"
                >
                  Enviar
                </button>
              </div>
            </div>

            {/* Sidebar: Character Stats */}
            <div class="w-64 flex flex-col gap-4">
              {/* Character Info */}
              <div class="bg-gray-900 border border-gray-700 rounded p-4">
                <h2 class="text-xl font-bold mb-4 neon-text">
                  {gameState?.playerName || "Personaje"}
                </h2>

                <div class="space-y-3 text-sm">
                  <div>
                    <label class="text-gray-500">Clase:</label>
                    <p id="playerClass" class="font-bold text-blue-400">
                      {gameState?.playerClass || "---"}
                    </p>
                  </div>

                  <div>
                    <label class="text-gray-500">Oficio:</label>
                    <p id="playerJob" class="font-bold text-purple-400">
                      {gameState?.playerJob || "---"}
                    </p>
                  </div>

                  <div>
                    <label class="text-gray-500 text-xs">Nivel de Clase</label>
                    <p id="classLvl" class="font-bold">
                      Lv. {gameState?.classLvl || 1}
                    </p>
                  </div>

                  <div>
                    <label class="text-gray-500 text-xs">Nivel de Oficio</label>
                    <p id="jobLvl" class="font-bold">
                      Lv. {gameState?.jobLvl || 1}
                    </p>
                  </div>
                </div>
              </div>

              {/* HP Bar */}
              <div class="bg-gray-900 border border-gray-700 rounded p-4">
                <label class="text-gray-500 text-sm mb-2 block">Vitalidad</label>
                <div class="stat-bar mb-2">
                  <div
                    id="hpFill"
                    class="stat-fill"
                    style="width: 100%"
                  ></div>
                </div>
                <p id="hpText" class="text-sm text-gray-400">
                  {gameState?.hp || 0} / {gameState?.maxHp || 100}
                </p>
              </div>

              {/* Resources */}
              <div class="bg-gray-900 border border-gray-700 rounded p-4">
                <h3 class="font-bold mb-3">Recursos</h3>
                <div class="space-y-2 text-sm">
                  <div class="flex justify-between">
                    <span class="text-gray-500">Oro:</span>
                    <span id="gold" class="text-yellow-400 font-bold">
                      {gameState?.gold || 0}
                    </span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">Experiencia:</span>
                    <span id="exp" class="text-green-400 font-bold">
                      {gameState?.experience || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Equipment */}
              <div class="bg-gray-900 border border-gray-700 rounded p-4">
                <h3 class="font-bold mb-3">Equipo</h3>
                <div class="space-y-2 text-xs">
                  {gameState?.equipment &&
                    Object.entries(gameState.equipment).map(([slot, item]) => (
                      <div key={slot} class="flex justify-between border-b border-gray-700 pb-1">
                        <span class="text-gray-500 capitalize">{slot}:</span>
                        <span class="text-cyan-400">{item || "---"}</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Commands Help */}
              <div class="bg-gray-900 border border-gray-700 rounded p-4 text-xs">
                <h3 class="font-bold mb-2">Comandos</h3>
                <ul class="space-y-1 text-gray-400">
                  <li>
                    <span class="text-green-400">atacar</span> - Luchar
                  </li>
                  <li>
                    <span class="text-green-400">explorar</span> - Moverse
                  </li>
                  <li>
                    <span class="text-green-400">hablar</span> - Conversar
                  </li>
                  <li>
                    <span class="text-green-400">inventory</span> - Mochila
                  </li>
                  <li>
                    <span class="text-green-400">status</span> - Estado
                  </li>
                </ul>
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
              const cmd = input.value.trim();
              if (!cmd) return;

              const res = await fetch("/api/command", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ command: cmd }),
              });
              const data = await res.json();
              updateUI(data);
              input.value = "";
              input.focus();
            }

            function updateUI(state) {
              document.getElementById("playerClass").textContent = state.playerClass;
              document.getElementById("playerJob").textContent = state.playerJob;
              document.getElementById("classLvl").textContent = "Lv. " + state.classLvl;
              document.getElementById("jobLvl").textContent = "Lv. " + state.jobLvl;
              document.getElementById("gold").textContent = state.gold;
              document.getElementById("exp").textContent = state.experience;

              const hpPercent = (state.hp / state.maxHp) * 100;
              document.getElementById("hpFill").style.width = hpPercent + "%";
              document.getElementById("hpText").textContent = state.hp + " / " + state.maxHp;

              const log = document.getElementById("gameLog");
              log.innerHTML = state.log.map(msg => \`<p>\${msg}</p>\`).join("");
              log.scrollTop = log.scrollHeight;
            }

            document.getElementById("sendBtn").addEventListener("click", sendCommand);
            document.getElementById("commandInput").addEventListener("keypress", (e) => {
              if (e.key === "Enter") sendCommand();
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
  return c.json(gameState);
});

// API endpoint: Process command
app.post("/api/command", async (c) => {
  if (!gameState) {
    return c.json({ error: "Game not initialized" }, 400);
  }

  const { command } = await c.req.json();
  const cmd = command.toLowerCase().trim();

  // Process command
  processCommand(cmd, gameState);

  return c.json(gameState);
});

function processCommand(cmd: string, state: GameState) {
  const responses: Record<string, () => void> = {
    atacar: () => {
      const damage = Math.floor(Math.random() * 25) + 10;
      state.hp = Math.max(0, state.hp - damage);
      state.experience += 25;
      state.log.push(`⚔️ Atacas ferozmente. Recibes ${damage} de daño.`);
      if (state.hp === 0) {
        state.log.push("💀 Has caído. Tu legado permanece en el Velo...");
      }
    },

    explorar: () => {
      const locations = [
        "Ruinas Antiguas",
        "Bosque de Corrosión",
        "Torre del Escriba",
        "Mercado Subterráneo",
        "Cavernas del Óxido",
      ];
      const newLoc = locations[Math.floor(Math.random() * locations.length)];
      state.location = newLoc;
      state.log.push(`🗺️ Exploras y llegas a: ${newLoc}`);
      state.log.push(describeLocation(newLoc));
    },

    hablar: () => {
      const npcs = ["Maren Ojalata", "Elias el Escriba", "Un Mendigo Errante"];
      const npc = npcs[Math.floor(Math.random() * npcs.length)];
      state.log.push(
        `💬 ${npc}: "El mundo está consumido por el Óxido... ¿Qué buscas aquí?"`
      );
    },

    inventory: () => {
      state.log.push("📦 Inventario:");
      state.log.push(`  - Daga (equipo)`);
      state.log.push(`  - ${state.gold} monedas de oro`);
    },

    status: () => {
      state.log.push("━━━ ESTADO ━━━");
      state.log.push(
        `${state.playerName} - ${state.playerClass} Nivel ${state.classLvl}`
      );
      state.log.push(`Oficio: ${state.playerJob} (Nivel ${state.jobLvl})`);
      state.log.push(`Ubicación: ${state.location}`);
      state.log.push(`HP: ${state.hp}/${state.maxHp} | Oro: ${state.gold}`);
    },

    ayuda: () => {
      state.log.push("Comandos disponibles:");
      state.log.push("  atacar - Lucha contra enemigos");
      state.log.push("  explorar - Viaja a nuevas locaciones");
      state.log.push("  hablar - Interactúa con NPCs");
      state.log.push("  inventory - Revisa tu mochila");
      state.log.push("  status - Ve tu estado");
    },
  };

  const action = responses[cmd];
  if (action) {
    action();
  } else {
    state.log.push(`❓ Comando desconocido: "${cmd}". Escribe 'ayuda' para ver opciones.`);
  }
}

function describeLocation(location: string): string {
  const descriptions: Record<string, string> = {
    "Ruinas Antiguas":
      "Estructuras derruidas emergen de la niebla. Puedes sentir la presencia de algo antiguo.",
    "Bosque de Corrosión":
      "Árboles muertos rodean el camino. El aire huele a metal oxidado.",
    "Torre del Escriba":
      "Una torre de piedra se alza majestuosa. Luces extrañas brillan en las ventanas.",
    "Mercado Subterráneo":
      "Mercaderes vendedores ofrecen sus wares. El lugar respira de actividad.",
    "Cavernas del Óxido":
      "Profundas cavernas llenan de ecos. El agua gotea con un sonido metálico.",
  };

  return descriptions[location] || "Un lugar desconocido.";
}

export default app;

