const express    = require("express");
const cors       = require("cors");
const fs         = require("fs");
const path       = require("path");
const crypto     = require("crypto");
const cookieParser = require("cookie-parser");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(cookieParser());

// ─────────────────────────────────────────
//  CONFIG — เปลี่ยน username / password ที่นี่
// ─────────────────────────────────────────
const USERS = [
  { username: "admin", password: "1234" },
  // เพิ่ม user อื่นได้ตรงนี้:
  // { username: "alice", password: "mypassword" },
];

// Session store (in-memory, เพียงพอสำหรับใช้งานส่วนตัว)
// หากต้องการ persistence ข้ามรีสตาร์ท ให้เปลี่ยนเป็น file/DB
const sessions = new Map();
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 วัน

// ─────────────────────────────────────────
//  AUTH HELPERS
// ─────────────────────────────────────────
function createSession(username) {
  const token   = crypto.randomBytes(32).toString("hex");
  const expires = Date.now() + SESSION_TTL;
  sessions.set(token, { username, expires });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expires) {
    sessions.delete(token);
    return null;
  }
  return s;
}

function requireAuth(req, res, next) {
  const token = req.cookies?.session;
  if (getSession(token)) return next();
  // API requests → 401 JSON
  if (req.path.startsWith("/shelves")) {
    return res.status(401).json({ message: "กรุณาเข้าสู่ระบบก่อน" });
  }
  // Browser requests → redirect to login
  res.redirect("/login.html");
}

// ─────────────────────────────────────────
//  AUTH ROUTES (ไม่ต้อง auth)
// ─────────────────────────────────────────

// POST /auth/login
app.post("/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = USERS.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
  }
  const token = createSession(username);
  res.cookie("session", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge:   SESSION_TTL,
  });
  res.json({ ok: true, username });
});

// GET /auth/me — ตรวจสอบว่า login อยู่หรือเปล่า
app.get("/auth/me", (req, res) => {
  const s = getSession(req.cookies?.session);
  if (s) return res.json({ username: s.username });
  res.status(401).json({ message: "Not authenticated" });
});

// POST /auth/logout
app.post("/auth/logout", (req, res) => {
  const token = req.cookies?.session;
  if (token) sessions.delete(token);
  res.clearCookie("session");
  res.json({ ok: true });
});

// ─────────────────────────────────────────
//  STATIC FILES
//  login.html เข้าถึงได้โดยไม่ต้อง login
//  หน้าอื่น ๆ ต้องผ่าน requireAuth
// ─────────────────────────────────────────

// เส้นทางสาธารณะ (login page)
app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

// "/" ต้อง auth → index.html
app.get("/", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// shelf.html ต้อง auth
app.get("/shelf.html", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "shelf.html"));
});

// Static assets (CSS, JS, fonts ที่ฝังใน HTML ไม่ต้อง auth)
app.use(express.static(path.join(__dirname), {
  index: false, // ป้องกัน auto-serve index.html โดยไม่ผ่าน auth
}));

// ─────────────────────────────────────────
//  DATA
// ─────────────────────────────────────────
const DATA_FILE = "data.json";

function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE)); }
  catch { return { shelves: [] }; }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ─────────────────────────────────────────
//  API ROUTES (ทุก route ต้อง auth)
// ─────────────────────────────────────────
app.use("/shelves", requireAuth);

// GET shelves
app.get("/shelves", (req, res) => {
  res.json(loadData().shelves);
});

// ADD shelf
app.post("/shelves", (req, res) => {
  const data = loadData();
  const newShelf = { id: Date.now(), name: req.body.name, books: [] };
  data.shelves.push(newShelf);
  saveData(data);
  res.json(newShelf);
});

// UPDATE shelf
app.put("/shelves/:id", (req, res) => {
  const data  = loadData();
  const shelf = data.shelves.find(s => s.id == req.params.id);
  if (shelf) { shelf.name = req.body.name; saveData(data); res.json(shelf); }
  else res.status(404).json({ message: "Not found" });
});

// DELETE shelf
app.delete("/shelves/:id", (req, res) => {
  let data = loadData();
  data.shelves = data.shelves.filter(s => s.id != req.params.id);
  saveData(data);
  res.json({ success: true });
});

// GET books
app.get("/shelves/:id/books", (req, res) => {
  const data  = loadData();
  const shelf = data.shelves.find(s => s.id == req.params.id);
  res.json(shelf ? shelf.books : []);
});

// ADD book
app.post("/shelves/:id/books", (req, res) => {
  const data  = loadData();
  const shelf = data.shelves.find(s => s.id == req.params.id);
  if (!shelf) return res.status(404).json({ message: "Shelf not found" });
  const newBook = { id: Date.now(), title: req.body.title, content: "" };
  shelf.books.push(newBook);
  saveData(data);
  res.json(newBook);
});

// UPDATE book
app.put("/shelves/:sid/books/:bid", (req, res) => {
  const data  = loadData();
  const shelf = data.shelves.find(s => s.id == req.params.sid);
  const book  = shelf?.books.find(b => b.id == req.params.bid);
  if (book) {
    book.title   = req.body.title;
    book.content = req.body.content;
    saveData(data);
    res.json(book);
  } else res.status(404).json({ message: "Not found" });
});

// DELETE book
app.delete("/shelves/:sid/books/:bid", (req, res) => {
  const data  = loadData();
  const shelf = data.shelves.find(s => s.id == req.params.sid);
  if (shelf) {
    shelf.books = shelf.books.filter(b => b.id != req.params.bid);
    saveData(data);
  }
  res.json({ success: true });
});

// ─────────────────────────────────────────
//  START
// ─────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`📚 Library server running on http://localhost:${PORT}`);
  console.log(`   Login with: ${USERS.map(u => u.username).join(", ")}`);
});