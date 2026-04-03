const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// Serve index.html for "/"
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const DATA_FILE = "data.json";

// Load & Save data
function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE));
  } catch {
    return { shelves: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ===== SHELVES =====

// GET shelves
app.get("/shelves", (req, res) => {
  res.json(loadData().shelves);
});

// ADD shelf
app.post("/shelves", (req, res) => {
  const data = loadData();

  const newShelf = {
    id: Date.now(),
    name: req.body.name,
    books: []
  };

  data.shelves.push(newShelf);
  saveData(data);

  res.json(newShelf);
});

// UPDATE shelf
app.put("/shelves/:id", (req, res) => {
  const data = loadData();
  const shelf = data.shelves.find(s => s.id == req.params.id);

  if (shelf) {
    shelf.name = req.body.name;
    saveData(data);
    res.json(shelf);
  }
});

// DELETE shelf
app.delete("/shelves/:id", (req, res) => {
  let data = loadData();
  data.shelves = data.shelves.filter(s => s.id != req.params.id);
  saveData(data);

  res.json({ success: true });
});

// ===== BOOKS =====

// GET books
app.get("/shelves/:id/books", (req, res) => {
  const data = loadData();
  const shelf = data.shelves.find(s => s.id == req.params.id);
  res.json(shelf ? shelf.books : []);
});

// ADD book
app.post("/shelves/:id/books", (req, res) => {
  const data = loadData();
  const shelf = data.shelves.find(s => s.id == req.params.id);

  const newBook = {
    id: Date.now(),
    title: req.body.title,
    content: ""
  };

  shelf.books.push(newBook);
  saveData(data);

  res.json(newBook);
});

// UPDATE book
app.put("/shelves/:sid/books/:bid", (req, res) => {
  const data = loadData();
  const shelf = data.shelves.find(s => s.id == req.params.sid);
  const book = shelf.books.find(b => b.id == req.params.bid);

  if (book) {
    book.title = req.body.title;
    book.content = req.body.content;
    saveData(data);
    res.json(book);
  }
});

// DELETE book
app.delete("/shelves/:sid/books/:bid", (req, res) => {
  const data = loadData();
  const shelf = data.shelves.find(s => s.id == req.params.sid);
  shelf.books = shelf.books.filter(b => b.id != req.params.bid);
  saveData(data);

  res.json({ success: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});