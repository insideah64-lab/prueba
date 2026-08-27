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
  inventory: Item[];
  log: string[];
  isAlive: boolean;
  factionRep: Record<string, number>;
  sessionId: string;
}

let gameState: GameState | null = null;

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
  inventory: [
    { name: "Daga de Hierro", type: "arma", rarity: "Común", stats: { ataque: 5 } },
    { name: "Jubón de Cuero", type: "armadura", rarity: "Común", stats: { defensa: 3 } },
  ],
  log: [],
  isAlive: true,
  factionRep: { "Barones del Plomo": 0, "Culto del Óxido": 0 },
  sessionId: Math.random().toString(36).substring(7),
});

function saveGame(state: GameState) {
  try {
    const saves = existsSync(SAVE_PATH) ? JSON.parse(readFileSync(SAVE_PATH, "utf-8")) : {};
    saves[state.sessionId] = state;
    writeFileSync(SAVE_PATH, JSON.stringify(saves, null, 2));
  } catch (e) {
    console.error("Save:", e);
  }
}

async function interpretAction(action: string, state: GameState): Promise<any> {
  if (!Bun.env.GROQ_API_KEY) return { narrative: "IA offline", hpChange: 0, xpChange: 0, itemsGained: [] };
  try {
    const prompt = `Eres árbitro de Aethelraed MUD. Jugador: ${state.playerName} (${state.playerClass} Lv${state.classLvl}). Acción: "${action}". Responde JSON: {"narrative":"...","hpChange":0,"xpChange":25,"itemsGained":[]}`;
    const response = await groq.messages.create({
      model: "mixtral-8x7b-32768",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { narrative: parsed.narrative || "Algo sucede", hpChange: parsed.hpChange || 0, xpChange: parsed.xpChange || 0, itemsGained: [] };
    }
  } catch (e) {
    console.error("Groq:", e);
  }
  return { narrative: "El silencio envuelve tu acción", hpChange: 0, xpChange: 10, itemsGained: [] };
}

const jsCode = `
async function initGame(){const n=prompt('Tu nombre:','Darian');if(!n)return;const r=await fetch('/api/init',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n})});updateUI(await r.json())}async function sendCmd(){const e=document.getElementById('cmd'),t=document.getElementById('btn'),n=e.value.trim();if(!n)return;t.disabled=!0,t.textContent='...',e.disabled=!0;try{const i=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:n})});updateUI(await i.json()),e.value='',e.focus()}catch(r){console.error(r)}t.disabled=!1,t.textContent='Ejecutar',e.disabled=!1}function updateUI(e){document.getElementById('name').textContent=e.playerName,document.getElementById('class').textContent=e.playerClass,document.getElementById('job').textContent=e.playerJob,document.getElementById('loc').textContent=e.location,document.getElementById('clvl').textContent=e.classLvl,document.getElementById('jlvl').textContent=e.jobLvl,document.getElementById('gold').textContent=e.gold,document.getElementById('xp').textContent=e.experience,document.getElementById('baron').textContent=e.factionRep['Barones del Plomo']||0,document.getElementById('cult').textContent=e.factionRep['Culto del Óxido']||0;const t=(e.hp/e.maxHp)*100;document.getElementById('hpFill').style.width=Math.min(t,100)+'%',document.getElementById('hp').textContent=e.hp+'/'+e.maxHp;const i=document.getElementById('gameLog');i.innerHTML=e.log.map(function(e){return'<p>'+e+'</p>'}).join(''),i.scrollTop=i.scrollHeight}document.getElementById('btn').addEventListener('click',sendCmd),document.getElementById('cmd').addEventListener('keypress',function(e){'Enter'===e.key&&!e.shiftKey&&(e.preventDefault(),sendCmd())}),initGame()
`;

app.get("/", (c) => {
  return c.html(
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Aethelraed MUD</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>{`
          .mud-log{font-family:'Courier New',monospace;background:#0a0e27;color:#00d084;border:1px solid #1a2332}
          .mud-log p{margin:4px 0;font-size:13px}
          .mud-input{background:#0a0e27;color:#00d084;border:1px solid #1a2332;font-family:'Courier New',monospace}
          .mud-header{background:linear-gradient(135deg,#1a1f3a 0%,#2d1b4e 100%);border-bottom:2px solid #3d2e5f}
          .stat-fill{background:linear-gradient(90deg,#00d084 0%,#00f0a9 100%);height:100%;transition:width 0.3s}
          .neon-text{text-shadow:0 0 10px rgba(0,208,132,0.8)}
        `}</style>
      </head>
      <body class="bg-gray-950 text-gray-100">
        <div class="min-h-screen flex flex-col">
          <div class="mud-header p-4">
            <h1 class="text-3xl font-bold neon-text mb-1">⚔️ Aethelraed: Infinity Engine</h1>
            <p class="text-xs text-gray-400">Escribe tus acciones. La IA las interpreta.</p>
          </div>
          <div class="flex-1 flex gap-3 p-3 overflow-hidden">
            <div class="flex-1 flex flex-col gap-3">
              <div class="mud-log rounded p-3 flex-1 overflow-y-auto"><div id="gameLog"><p class="text-yellow-400">[Conectando...]</p></div></div>
              <div class="flex gap-2">
                <textarea id="cmd" placeholder="Tu acción..." class="flex-1 mud-input px-3 py-2 rounded text-sm" rows="2"></textarea>
                <button id="btn" class="px-4 py-2 bg-green-700 rounded font-bold text-sm">Ejecutar</button>
              </div>
            </div>
            <div class="w-72 flex flex-col gap-2 overflow-y-auto">
              <div class="bg-gray-900 border border-gray-700 rounded p-3">
                <h2 class="text-lg font-bold neon-text mb-2" id="name">---</h2>
                <div class="space-y-1 text-xs">
                  <div class="flex justify-between"><span class="text-gray-500">Clase:</span><span id="class" class="text-blue-400">---</span></div>
                  <div class="flex justify-between"><span class="text-gray-500">Oficio:</span><span id="job" class="text-purple-400">---</span></div>
                  <div class="flex justify-between"><span class="text-gray-500">Ubicación:</span><span id="loc" class="text-cyan-400">---</span></div>
                </div>
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
            </div>
          </div>
        </div>
        <script dangerouslySetInnerHTML={{__html:jsCode}}/>
      </body>
    </html>
  );
});

app.post("/api/init", async (c) => {
  const { name } = await c.req.json();
  gameState = initializeGame(name);
  gameState.log.push("🌑 Bienvenido a Aethelraed: Infinity Engine 🌑");
  gameState.log.push("Tu nombre es: " + name);
  gameState.log.push("Escribe tus acciones libremente.");
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

  if (gameState.hp <= 0) {
    gameState.isAlive = false;
    gameState.log.push("💀 Has caído.");
  }

  if (Math.random() < 0.1) {
    const events = ["Niebla...", "Grito lejano...", "Tiembla el suelo..."];
    gameState.log.push("⚠️ " + events[Math.floor(Math.random() * events.length)]);
  }

  saveGame(gameState);
  return c.json(gameState);
});

export default app;

