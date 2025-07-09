require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("medCamp pro server is running");
});

app.listen(port, () => {
  console.log(`MedCamp Pro Server listening on port ${port}`);
});
