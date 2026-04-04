const express      = require("express");
const cors         = require("cors");
const fs           = require("fs");
const path         = require("path");
const crypto       = require("crypto");
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

// Session store (in-memory)
const sessions    = new Map();
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
  if (Date.now() > s.expires) { sessions.delete(token); return null; }
  return s;
}

function requireAuth(req, res, next) {
  if (getSession(req.cookies?.session)) return next();
  res.redirect("/login.html");
}

function requireAuthApi(req, res, next) {
  if (getSession(req.cookies?.session)) return next();
  res.status(401).json({ message: "กรุณาเข้าสู่ระบบก่อน" });
}

// ─────────────────────────────────────────
//  AUTH ROUTES
// ─────────────────────────────────────────
app.post("/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = USERS.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
  const token = createSession(username);
  res.cookie("session", token, { httpOnly: true, sameSite: "lax", maxAge: SESSION_TTL });
  res.json({ ok: true, username });
});

app.get("/auth/me", (req, res) => {
  const s = getSession(req.cookies?.session);
  if (s) return res.json({ username: s.username });
  res.status(401).json({ message: "Not authenticated" });
});

app.post("/auth/logout", (req, res) => {
  const token = req.cookies?.session;
  if (token) sessions.delete(token);
  res.clearCookie("session");
  res.json({ ok: true });
});

// ─────────────────────────────────────────
//  HTML ROUTES
//  *** ไม่ใช้ express.static ***
//  ทุกหน้าผ่าน Express เพื่อให้ auth ทำงานได้
// ─────────────────────────────────────────

// หน้า login — เข้าได้โดยไม่ต้อง auth
app.get("/login.html", (req, res) => {
  if (getSession(req.cookies?.session)) return res.redirect("/");
  res.sendFile(path.join(__dirname, "login.html"));
});

// "/" → redirect ไป login ถ้ายังไม่ได้ login
app.get("/", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// index.html โดยตรง
app.get("/index.html", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// shelf.html
app.get("/shelf.html", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "shelf.html"));
});

// ─────────────────────────────────────────
//  DATA
// ─────────────────────────────────────────
const DATA_FILE = path.join(__dirname, "data.json");

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
app.use("/shelves", requireAuthApi);

app.get("/shelves", (req, res) => {
  res.json(loadData().shelves);
});

app.post("/shelves", (req, res) => {
  const data     = loadData();
  const newShelf = { id: Date.now(), name: req.body.name, books: [] };
  data.shelves.push(newShelf);
  saveData(data);
  res.json(newShelf);
});

app.put("/shelves/:id", (req, res) => {
  const data  = loadData();
  const shelf = data.shelves.find(s => s.id == req.params.id);
  if (!shelf) return res.status(404).json({ message: "Not found" });
  shelf.name = req.body.name;
  saveData(data);
  res.json(shelf);
});

app.delete("/shelves/:id", (req, res) => {
  const data   = loadData();
  data.shelves = data.shelves.filter(s => s.id != req.params.id);
  saveData(data);
  res.json({ success: true });
});

app.get("/shelves/:id/books", (req, res) => {
  const data  = loadData();
  const shelf = data.shelves.find(s => s.id == req.params.id);
  res.json(shelf ? shelf.books : []);
});

app.post("/shelves/:id/books", (req, res) => {
  const data  = loadData();
  const shelf = data.shelves.find(s => s.id == req.params.id);
  if (!shelf) return res.status(404).json({ message: "Shelf not found" });
  const newBook = { id: Date.now(), title: req.body.title, content: "" };
  shelf.books.push(newBook);
  saveData(data);
  res.json(newBook);
});

app.put("/shelves/:sid/books/:bid", (req, res) => {
  const data  = loadData();
  const shelf = data.shelves.find(s => s.id == req.params.sid);
  const book  = shelf?.books.find(b => b.id == req.params.bid);
  if (!book) return res.status(404).json({ message: "Not found" });
  book.title   = req.body.title;
  book.content = req.body.content;
  saveData(data);
  res.json(book);
});

app.delete("/shelves/:sid/books/:bid", (req, res) => {
  const data  = loadData();
  const shelf = data.shelves.find(s => s.id == req.params.sid);
  if (shelf) shelf.books = shelf.books.filter(b => b.id != req.params.bid);
  saveData(data);
  res.json({ success: true });
});

// ─────────────────────────────────────────
//  START
// ─────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`📚 Library running on http://localhost:${PORT}`);
});