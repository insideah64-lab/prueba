/** @jsx jsx */
/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { jsx } from "hono/jsx";
import Groq from "groq-sdk";
import { writeFileSync, readFileSync, existsSync } from "fs";

const app = new Hono();

// ===== ENV / SERVER CONFIG =====
const PORT = Number(Bun.env.PORT ?? process.env.PORT ?? 8080);
const HOST = "0.0.0.0";

console.log("DEBUG env:", {
  PORT,
  GROQ_KEY_PRESENT: Boolean(Bun.env.GROQ_API_KEY ?? process.env.GROQ_API_KEY),
});

// ===== GROQ CLIENT INITIALIZATION (SEGURA) =====
let groq: any = null;
const GROQ_KEY = Bun.env.GROQ_API_KEY ?? process.env.GROQ_API_KEY ?? "";

if (GROQ_KEY) {
  try {
    groq = new (Groq as any)({ apiKey: GROQ_KEY });
  } catch (e) {
    console.error("Error inicializando Groq SDK:", e);
    groq = null;
  }
} else {
  console.warn("No GROQ API key found in environment. Groq client disabled.");
}

const SAVE_PATH = "/tmp/aethelraed_saves.json";

// ===== TYPES =====
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
  stats: Record<string, number>;
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

// ===== GAME STATE FUNCTIONS =====
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
  stats: defaultStats,
  sessionId: Math.random().toString(36).substring(7),
});

function saveGame(state: GameState) {
  try {
    const saves = existsSync(SAVE_PATH)
      ? JSON.parse(readFileSync(SAVE_PATH, "utf-8"))
      : {};
    saves[state.sessionId] = state;
    writeFileSync(SAVE_PATH, JSON.stringify(saves, null, 2));
  } catch (e) {
    console.error("Save failed:", e);
  }
}

// ===== AI INTERPRETATION =====
async function interpretAction(
  action: string,
  state: GameState
): Promise<{
  narrative: string;
  hpChange: number;
  xpChange: number;
  itemsGained: Item[];
}> {
  if (!groq) {
    return {
      narrative: "La IA está offline. Intenta luego.",
      hpChange: 0,
      xpChange: 0,
      itemsGained: [],
    };
  }

  try {
    const prompt = `Eres el árbitro de Aethelraed: Infinity Engine. 
Jugador: ${state.playerName} (${state.playerClass} Lv${state.classLvl}, HP ${state.hp}/${state.maxHp})
Acción: "${action}"

Responde SOLO en JSON válido:
{
  "narrative": "Una frase épica y oscura de máx 2 líneas",
  "hpChange": -10,
  "xpChange": 25,
  "itemsGained": []
}

Notas: hpChange negativo = daño. xpChange ganado. Sé creativo pero breve.`;

    const call = async () => {
      const response = await groq.messages.create({
        model: "mixtral-8x7b-32768",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      });

      const text =
        response.content?.[0]?.type === "text" ? response.content[0].text : "{}";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          narrative: parsed.narrative || "Algo sucede en la penumbra...",
          hpChange: parsed.hpChange || 0,
          xpChange: parsed.xpChange || 0,
          itemsGained: parsed.itemsGained || [],
        };
      }
      return {
        narrative: "El silencio envuelve tu acción...",
        hpChange: 0,
        xpChange: 10,
        itemsGained: [],
      };
    };

    // Timeout guard (10s)
    const timeoutMs = 10000;
    const result = await Promise.race([
      call(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("GROQ timeout")), timeoutMs)
      ),
    ]);
    return result as any;
  } catch (error) {
    console.error("Groq error o timeout:", error);
  }

  return {
    narrative: "El silencio envuelve tu acción...",
    hpChange: 0,
    xpChange: 10,
    itemsGained: [],
  };
}

// ===== WEB ROUTES =====
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
            font-size: 13px;
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
            opacity: 0.5;
          }
          @keyframes pulse {
            0%, 100% {
              opacity: 0.5;
            }
            50% {
              opacity: 1;
            }
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
              Escribe tus acciones. La IA interpreta tu destino.
            </p>
          </div>

          <div class="flex-1 flex gap-3 p-3 max-w-full overflow-hidden">
            {/* Main Game Area */}
            <div class="flex-1 flex flex-col gap-3 min-w-0">
              {/* Log */}
              <div class="mud-log rounded p-3 flex-1 overflow-y-auto">
                <div id="gameLog">
                  <p class="text-yellow-400">[Conectando con el Motor...]</p>
                </div>
              </div>

              {/* Input */}
              <div class="flex gap-2 flex-shrink-0">
                <textarea
                  id="commandInput"
                  placeholder="Tu acción (ej: ataco al monstruo)..."
                  class="flex-1 mud-input px-3 py-2 rounded text-sm"
                  rows="2"
                ></textarea>
                <button
                  id="sendBtn"
                  class="px-4 py-2 bg-green-700 hover:bg-green-600 rounded font-bold text-sm flex-shrink-0"
                >
                  Ejecutar
                </button>
              </div>
            </div>

            {/* Sidebar */}
            <div class="w-72 flex flex-col gap-2 overflow-y-auto flex-shrink-0">
              {/* Character Card */}
              <div class="bg-gray-900 border border-gray-700 rounded p-3">
                <h2 class="text-lg font-bold neon-text mb-2">
                  {gameState?.playerName || "---"}
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
                  <div id="hpFill" class="stat-fill" style="width: 100%"></div>
                </div>
                <p id="hpText" class="text-xs text-gray-400">
                  {gameState?.hp || 0} / {gameState?.maxHp || 100}
                </p>
              </div>

              {/* Levels */}
              <div class="bg-gray-900 border border-gray-700 rounded p-3">
                <div class="space-y-2 text-xs">
                  <div class="flex justify-between">
                    <span class="text-gray-500">Clase Lv:</span>
                    <span id="classLvl">{gameState?.classLvl || 1}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">Oficio Lv:</span>
                    <span id="jobLvl">{gameState?.jobLvl || 1}</span>
                  </div>
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
                    <span class="text-gray-500">XP:</span>
                    <span id="exp" class="text-green-400 font-bold">
                      {gameState?.experience || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Factions */}
              <div class="bg-gray-900 border border-gray-700 rounded p-3">
                <h3 class="font-bold mb-2 text-xs">Facciones</h3>
                <div id="factionList" class="space-y-1 text-xs">
                  <div class="flex justify-between">
                    <span class="text-gray-500">Barones del Plomo:</span>
                    <span id="baron" class="text-gray-400">0</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">Culto del Óxido:</span>
                    <span id="cult" class="text-gray-400">0</span>
                  </div>
                </div>
              </div>

              {/* Inventory */}
              <div class="bg-gray-900 border border-gray-700 rounded p-3">
                <h3 class="font-bold mb-2 text-xs">
                  Inventario ({gameState?.inventory.length || 0})
                </h3>
                <div id="inventoryList" class="space-y-1 text-xs max-h-40 overflow-y-auto">
                  {gameState?.inventory.map((item, idx) => (
                    <div key={idx} class="flex justify-between border-b border-gray-700 pb-1">
                      <span>{item.name}</span>
                      <span class="text-cyan-400">{item.rarity}</span>
                    </div>
                  )) || null}
                </div>
              </div>
            </div>
          </div>
        </div>

        <script>
          {`
            async function initGame() {
              const name = prompt("¿Cuál es tu nombre, viajero?", "Darian");
              if (!name) return;
              const res = await fetch("/api/init", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
              });
              const data = await res.json();
              updateUI(data);
            }

            async function sendCommand() {
              const input = document.getElementById("commandInput");
              const btn = document.getElementById("sendBtn");
              const action = input.value.trim();
              if (!action) return;

              btn.disabled = true;
              btn.classList.add("loading");
              input.disabled = true;
              btn.textContent = "...";

              try {
                const res = await fetch("/api/action", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action }),
                });
                const data = await res.json();
                updateUI(data);
                input.value = "";
                input.focus();
              } catch (e) {
                console.error(e);
              }

              btn.disabled = false;
              btn.classList.remove("loading");
              btn.textContent = "Ejecutar";
              input.disabled = false;
            }

            function updateUI(state) {
              document.getElementById("playerClass").textContent =
                state.playerClass;
              document.getElementById("playerJob").textContent = state.playerJob;
              document.getElementById("location").textContent = state.location;
              document.getElementById("classLvl").textContent = state.classLvl;
              document.getElementById("jobLvl").textContent = state.jobLvl;
              document.getElementById("gold").textContent = state.gold;
              document.getElementById("exp").textContent = state.experience;
              document.getElementById("baron").textContent =
                state.factionRep["Barones del Plomo"] || 0;
              document.getElementById("cult").textContent =
                state.factionRep["Culto del Óxido"] || 0;

              const hpPercent = (state.hp / state.maxHp) * 100;
              document.getElementById("hpFill").style.width =
                Math.min(hpPercent, 100) + "%";
              document.getElementById("hpText").textContent =
                state.hp + " / " + state.maxHp;

              // FIX: build log HTML correctly
              const log = document.getElementById("gameLog");
              log.innerHTML = state.log.map((msg) => '<p>' + msg + '</p>').join("");
              log.scrollTop = log.scrollHeight;
            }

            document
              .getElementById("sendBtn")
              .addEventListener("click", sendCommand);
            document
              .getElementById("commandInput")
              .addEventListener("keypress", (e) => {
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

// ===== TEMP DIAGNOSTIC ROUTES (REMOVE AFTER DEBUG) =====
app.get("/_diag", (c) => {
  return c.json({
    bun_env_port: (typeof Bun !== "undefined" ? (Bun as any).env?.PORT : undefined),
    process_env_port: process?.env?.PORT ?? undefined,
    groq_key_present: Boolean((typeof Bun !== "undefined" ? (Bun as any).env?.GROQ_API_KEY : undefined) ?? process?.env?.GROQ_API_KEY),
  });
});

app.get("/ping", (c) => {
  console.log("PING /ping received");
  return c.text("pong");
});

app.get("/api/action", (c) => {
  return c.text("GET /api/action OK");
});

// ===== API ENDPOINTS =====
app.post("/api/init", async (c) => {
  const { name } = await c.req.json();
  gameState = initializeGame(name);

  gameState.log.push(
    "══════════════════════════════════════════════════════════="
  );
  gameState.log.push("🌑 Bienvenido a Aethelraed: Infinity Engine 🌑");
  gameState.log.push(`Tu nombre es: ${name}`);
  gameState.log.push("El mundo está envuelto en óxido y corrupción.");
  gameState.log.push("Escribe tus acciones libremente.");
  gameState.log.push(
    "══════════════════════════════════════════════════════════="
  );
  gameState.log.push("Despiertas en la Taberna del Óxido...");

  saveGame(gameState);
  return c.json(gameState);
});

app.post("/api/action", async (c) => {
  console.log("REQUEST /api/action received - headers:", JSON.stringify(Object.fromEntries(c.req.headers)));

  if (!gameState) {
    return c.json({ error: "Game not initialized" }, 400);
  }

  if (!gameState.isAlive) {
    gameState.log.push("💀 Estás muerto. Tu aventura ha terminado.");
    return c.json(gameState);
  }

  const { action } = await c.req.json();

  // Interpret action with AI (with timeout inside interpretAction)
  const result = await interpretAction(action, gameState);

  // Log action
  gameState.log.push(`> ${action}`);
  gameState.log.push(`✨ ${result.narrative}`);

  // Apply changes
  gameState.hp = Math.max(0, gameState.hp + result.hpChange);
  gameState.experience += result.xpChange;
  gameState.classXp += Math.floor(result.xpChange * 0.6);
  gameState.jobXp += Math.floor(result.xpChange * 0.4);

  // Check levelups
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
      `🎯 ¡MAESTRÍA! Tu oficio ${gameState.playerJob} es ahora Nivel ${gameState.jobLvl}`
    );
  }

  // Add items
  for (const item of result.itemsGained) {
    gameState.inventory.push(item);
    gameState.log.push(`📦 Obtuviste: ${item.name} (${item.rarity})`);
  }

  // Check death
  if (gameState.hp <= 0) {
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

// ===== START SERVER (BUN) =====
if (typeof Bun !== "undefined" && (Bun as any).serve) {
  (Bun as any).serve({
    fetch: app.fetch,
    port: PORT,
    hostname: HOST,
    development: false,
    async onRequest(request, server) {
      return await app.fetch(request);
    },
  });
  console.log(`Started server: http://${HOST}:${PORT}`);
}

// handle SIGTERM gracefully (best-effort)
if (typeof process !== "undefined" && process?.on) {
  process.on("SIGTERM", () => {
    console.log("SIGTERM recibida, cerrando...");
    try {
      // salvo si hay estado
      if (gameState) saveGame(gameState);
    } catch (e) {
      console.error("Error saving on SIGTERM:", e);
    }
    // allow the platform to kill the process after cleanup
    setTimeout(() => {
      try {
        process.exit(0);
      } catch {}
    }, 1000);
  });
}

export default app;
