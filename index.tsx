/** @jsx jsx */
/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { jsx } from "hono/jsx";
import Groq from "groq-sdk";
import { writeFileSync, readFileSync, existsSync } from "fs";

const app = new Hono();
const groq = new Groq({ apiKey: Bun.env.GROQ_API_KEY || "" });
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
  factionRep: Record<string, number>;
  stats: Record<string, number>;
  sessionId: string;
}

let gameState: GameState | null = null;

const defaultStats = { Fuerza: 8, Agilidad: 8, Inteligencia: 8, Resistencia: 8, Suerte: 8 };

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
  equipment: { weapon: null, armor: null, head: null, accessory: null },
  inventory: [
    { name: "Daga de Hierro", type: "arma", rarity: "Común", stats: { ataque: 5 }, quantity: 1 },
    { name: "Jubón de Cuero", type: "armadura", rarity: "Común", stats: { defensa: 3 }, quantity: 1 },
  ],
  log: [],
  isAlive: true,
  factionRep: { "Barones del Plomo": 0, "Culto del Óxido": 0 },
  stats: defaultStats,
  sessionId: Math.random().toString(36).substring(7),
});

function saveGame(state: GameState) {
  try {
    const saves = existsSync(SAVE_PATH) ? JSON.parse(readFileSync(SAVE_PATH, "utf-8")) : {};
    saves[state.sessionId] = state;
    writeFileSync(SAVE_PATH, JSON.stringify(saves, null, 2));
  } catch (e) {
    console.error("Save error:", e);
  }
}

async function interpretAction(action: string, state: GameState): Promise<{ narrative: string; hpChange: number; xpChange: number; itemsGained: Item[] }> {
  if (!Bun.env.GROQ_API_KEY) return { narrative: "IA offline", hpChange: 0, xpChange: 0, itemsGained: [] };

  try {
    const prompt = `Eres árbitro de Aethelraed MUD. 
Jugador: ${state.playerName} (${state.playerClass} Lv${state.classLvl}, HP ${state.hp}/${state.maxHp})
Acción: "${action}"

Responde SOLO JSON:
{"narrative":"Breve narrativa épica","hpChange":-10,"xpChange":25,"itemsGained":[]}`;

    const response = await groq.messages.create({
      model: "mixtral-8x7b-32768",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { narrative: parsed.narrative || "Algo sucede", hpChange: parsed.hpChange || 0, xpChange: parsed.xpChange || 0, itemsGained: parsed.itemsGained || [] };
    }
  } catch (error) {
    console.error(error);
  }

  return { narrative: "El silencio envuelve tu acción", hpChange: 0, xpChange: 10, itemsGained: [] };
}

app.get("/", (c) => {
  return c.html(
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Aethelraed MUD</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>{`
          .mud-log { font-family: 'Courier New', monospace; background: #0a0e27; color: #00d084; border: 1px solid #1a2332; }
          .mud-log p { margin: 4px 0; line-height: 1.4; font-size: 13px; }
          .mud-input { background: #0a0e27; color: #00d084; border: 1px solid #1a2332; font-family: 'Courier New', monospace; }
          .mud-header { background: linear-gradient(135deg, #1a1f3a 0%, #2d1b4e 100%); border-bottom: 2px solid #3d2e5f; }
          .stat-bar { background: #1a2332; border-radius: 4px; overflow: hidden; height: 16px; }
          .stat-fill { background: linear-gradient(90deg, #00d084 0%, #00f0a9 100%); height: 100%; transition: width 0.3s ease; }
          .neon-text { text-shadow: 0 0 10px rgba(0, 208, 132, 0.8); }
        `}</style>
      </head>
      <body class="bg-gray-950 text-gray-100">
        <div class="min-h-screen flex flex-col">
          <div class="mud-header p-4">
            <h1 class="text-3xl font-bold neon-text mb-1">⚔️ Aethelraed: Infinity Engine</h1>
            <p class="text-xs text-gray-400">Escribe tus acciones. La IA las interpreta.</p>
          </div>

          <div class="flex-1 flex gap-3 p-3 overflow-hidden">
            <div class="flex-1 flex flex-col gap-3 min-w-0">
              <div class="mud-log rounded p-3 flex-1 overflow-y-auto"><div id="gameLog"><p class="text-yellow-400">[Conectando...]</p></div></div>
              <div class="flex gap-2 flex-shrink-0">
                <textarea id="cmd" placeholder="Tu acción..." class="flex-1 mud-input px-3 py-2 rounded text-sm" rows="2"></textarea>
                <button id="btn" class="px-4 py-2 bg-green-700 hover:bg-green-600 rounded font-bold text-sm">Ejecutar</button>
              </div>
            </div>

            <div class="w-72 flex flex-col gap-2 overflow-y-auto flex-shrink-0">
              <div class="bg-gray-900 border border-gray-700 rounded p-3">
                <h2 class="text-lg font-bold neon-text mb-2" id="name">---</h2>
                <div class="space-y-1 text-xs">
                  <div class="flex justify-between"><span class="text-gray-500">Clase:</span><span id="class" class="text-blue-400">---</span></div>
                  <div class="flex justify-between"><span class="text-gray-500">Oficio:</span><span id="job" class="text-purple-400">---</span></div>
                  <div class="flex justify-between"><span class="text-gray-500">Ubicación:</span><span id="loc" class="text-cyan-400">---</span></div>
                </div>
              </div>

              <div class="bg-gray-900 border border-gray-700 rounded p-3">
                <label class="text-gray-500 text-xs block mb-1">HP</label>
                <div class="stat-bar mb-1"><div id="hpFill" class="stat-fill" style="width: 100%"></div></div>
                <p id="hp" class="text-xs">100/100</p>
              </div>

              <div class="bg-gray-900 border border-gray-700 rounded p-3">
                <div class="space-y-2 text-xs">
                  <div class="flex justify-between"><span class="text-gray-500">Clase Lv:</span><span id="clvl">1</span></div>
                  <div class="flex justify-between"><span class="text-gray-500">Oficio Lv:</span><span id="jlvl">1</span></div>
                  <div class="flex justify-between"><span class="text-gray-500">Oro:</span><span id="gold" class="text-yellow-400">0</span></div>
                  <div class="flex justify-between"><span class="text-gray-500">XP:</span><span id="xp" class="text-green-400">0</span></div>
                </div>
              </div>

              <div class="bg-gray-900 border border-gray-700 rounded p-3">
                <h3 class="font-bold mb-2 text-xs">Facciones</h3>
                <div class="space-y-1 text-xs">
                  <div class="flex justify-between"><span>Barones:</span><span id="baron">0</span></div>
                  <div class="flex justify-between"><span>Culto:</span><span id="cult">0</span></div>
                </div>
              </div>

              <div class="bg-gray-900 border border-gray-700 rounded p-3">
                <h3 class="font-bold mb-2 text-xs">Inventario</h3>
                <div id="inv" class="space-y-1 text-xs max-h-40 overflow-y-auto"></div>
              </div>
            </div>
          </div>
        </div>

        <script dangerouslySetInnerHTML={{__html: "async function initGame() { const name = prompt('Tu nombre:', 'Darian'); if (!name) return; const res = await fetch('/api/init', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }); const data = await res.json(); updateUI(data); } async function sendCmd() { const input = document.getElementById('cmd'); const btn = document.getElementById('btn'); const action = input.value.trim(); if (!action) return; btn.disabled = true; btn.textContent = '...'; input.disabled = true; try { const res = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }); const data = await res.json(); updateUI(data); input.value = ''; input.focus(); } catch (e) { console.error(e); } btn.disabled = false; btn.textContent = 'Ejecutar'; input.disabled = false; } function updateUI(state) { document.getElementById('name').textContent = state.playerName; document.getElementById('class').textContent = state.playerClass; document.getElementById('job').textContent = state.playerJob; document.getElementById('loc').textContent = state.location; document.getElementById('clvl').textContent = state.classLvl; document.getElementById('jlvl').textContent = state.jobLvl; document.getElementById('gold').textContent = state.gold; document.getElementById('xp').textContent = state.experience; document.getElementById('baron').textContent = state.factionRep['Barones del Plomo'] || 0; document.getElementById('cult').textContent = state.factionRep['Culto del Óxido'] || 0; const hpPercent = (state.hp / state.maxHp) * 100; document.getElementById('hpFill').style.width = Math.min(hpPercent, 100) + '%'; document.getElementById('hp').textContent = state.hp + '/' + state.maxHp; const log = document.getElementById('gameLog'); log.innerHTML = state.log.map(function(m) { return '<p>' + m + '</p>'; }).join(''); log.scrollTop = log.scrollHeight; const inv = document.getElementById('inv'); inv.innerHTML = state.inventory.map(function(item) { return '<div class=\\\"flex justify-between\\\"><span>' + item.name + '</span><span class=\\\"text-cyan-400\\\">' + item.rarity + '</span></div>'; }).join(''); } document.getElementById('btn').addEventListener('click', sendCmd); document.getElementById('cmd').addEventListener('keypress', function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCmd(); } }); initGame();"}} />
      </body>
    </html>
  );
});

app.post("/api/init", async (c) => {
  const { name } = await c.req.json();
  gameState = initializeGame(name);
  gameState.log.push("═══════════════════════════════════════════════════════════");
  gameState.log.push("🌑 Bienvenido a Aethelraed: Infinity Engine 🌑");
  gameState.log.push("Tu nombre es: " + name);
  gameState.log.push("El mundo está envuelto en óxido y corrupción.");
  gameState.log.push("Escribe tus acciones libremente.");
  gameState.log.push("═══════════════════════════════════════════════════════════");
  gameState.log.push("Despiertas en la Taberna del Óxido...");
  saveGame(gameState);
  return c.json(gameState);
});

app.post("/api/action", async (c) => {
  if (!gameState) return c.json({ error: "Not initialized" }, 400);
  if (!gameState.isAlive) {
    gameState.log.push("💀 Estás muerto.");
    return c.json(gameState);
  }

  const { action } = await c.req.json();
  const result = await interpretAction(action, gameState);

  gameState.log.push("> " + action);
  gameState.log.push("✨ " + result.narrative);

  gameState.hp = Math.max(0, gameState.hp + result.hpChange);
  gameState.experience += result.xpChange;
  gameState.classXp = (gameState.classXp || 0) + Math.floor(result.xpChange * 0.6);
  gameState.jobXp = (gameState.jobXp || 0) + Math.floor(result.xpChange * 0.4);

  if (gameState.classXp >= gameState.classLvl * 100) {
    gameState.classLvl++;
    gameState.classXp = 0;
    gameState.maxHp += 20;
    gameState.hp = gameState.maxHp;
    gameState.log.push("🌟 ¡Ascensión de clase! Nivel " + gameState.classLvl);
  }

  if (gameState.jobXp >= gameState.jobLvl * 100) {
    gameState.jobLvl++;
    gameState.jobXp = 0;
    gameState.log.push("🎯 ¡Maestría! Nivel " + gameState.jobLvl);
  }

  for (const item of result.itemsGained) {
    gameState.inventory.push(item);
    gameState.log.push("📦 +" + item.name + " (" + item.rarity + ")");
  }

  if (gameState.hp <= 0) {
    gameState.isAlive = false;
    gameState.log.push("💀 Has caído. Tu legado permanece en el Velo...");
  }

  if (Math.random() < 0.1) {
    const events = ["Una niebla errante desciende...", "El suelo tiembla...", "Una sombra aparece..."];
    gameState.log.push("⚠️ " + events[Math.floor(Math.random() * events.length)]);
  }

  saveGame(gameState);
  return c.json(gameState);
});

Bun.serve({
  fetch: app.fetch,
  port: 8080,
});

export default app;

