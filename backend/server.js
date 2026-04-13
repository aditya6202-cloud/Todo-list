const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Connect MongoDB
mongoose.connect("mongodb://localhost:27017/todoApp")
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));


// ✅ Task Schema
const Task = mongoose.model("Task", {
  text: String,
  done: Boolean,
  priority: String,
  dueDate: Date,
  userId: String,
  category: String
});

const Category = mongoose.model("Category", {
  name: String,
  emoji: String,
  userId: String
});

// ✅ User Schema
const User = mongoose.model("User", {
  name: String,
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
// ================= AUTH =================

// Signup
app.post("/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: "Email already exists" });
    }
    const user = new User({ name, email, password });
    await user.save();
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, password });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= CATEGORIES =================

// Get categories
app.get("/categories", async (req, res) => {
  const categories = await Category.find();
  res.json(categories);
});

// Add category
app.post("/categories", async (req, res) => {
  const category = new Category(req.body);
  await category.save();
  res.json(category);
});


// ================= ROUTES =================

// 🔹 Get all tasks
app.get("/tasks/:userId", async (req, res) => {
  const tasks = await Task.find({ userId: req.params.userId });
  res.json(tasks);
});

// 🔹 Add task
app.post("/tasks", async (req, res) => {
  const task = new Task(req.body);
  await task.save();
  res.json(task);
});

// 🔹 Update task
app.put("/tasks/:id", async (req, res) => {
  const updated = await Task.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );
  res.json(updated);
});

// 🔹 Delete task
app.delete("/tasks/:id", async (req, res) => {
  await Task.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted" });
});

app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

// ================= START SERVER =================
app.listen(5000, () => {
  console.log("Server running on port 5000");
});


