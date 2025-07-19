require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;

app.use(
  cors({
    origin: ["http://localhost:5173", "https://medcamp-pro.web.app"],
    credentials: true,
  })
);
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = process.env.DB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const database = client.db("MedCampProDB");
    const campsCollection = database.collection("camps");
    const usersCollection = database.collection("users");
    const registrationsCollection = database.collection("registrations");

    // user Get APi
    app.get("/users", async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // logedin user data gat API
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });

      if (user) {
        res.send(user);
      } else {
        res.status(404).send({ message: "User not found" });
      }
    });

    // lastSignInTime update API
    app.patch("/users/last-login/:email", async (req, res) => {
      const email = req.params.email;
      const lastSignInTime = req.body.lastLogin;

      const result = await usersCollection.updateOne(
        { email },
        { $set: { lastSignInTime } }
      );

      res.send(result);
    });

    // user Post ApI
    app.post("/users", async (req, res) => {
      const cursor = req.body;
      const exitingUser = await usersCollection.findOne({
        email: cursor.email,
      });

      cursor.role = "participant";

      if (exitingUser) {
        res.send(exitingUser);
      } else {
        const result = await usersCollection.insertOne(cursor);
        res.send(result);
      }
    });

    // user role update API
    app.put("/user", async (req, res) => {
      const email = req.query.email;
      const update = req.body;
      const result = await usersCollection.updateOne(
        { email },
        { $set: update },
        { upsert: true }
      );
      res.send(result);
    });

    // all camps get api
    app.get("/camps", async (req, res) => {
      const result = await campsCollection.find().toArray();
      res.send(result);
    });

    // single camp get API
    app.get("/camp-details/:id", async (req, res) => {
      const Id = req.params.id;
      const campId = { _id: new ObjectId(Id) };
      const result = await campsCollection.findOne(campId);
      res.send(result);
    });

    // camps by organizer email get API
    app.get("/camps/count", async (req, res) => {
      try {
        const email = req.query.email;

        if (!email) {
          return res
            .status(400)
            .json({ error: "Email query param is required" });
        }

        const count = await campsCollection.countDocuments({
          createdBy: email,
        });

        res.json({ count });
      } catch (err) {
        console.error("Error getting camp count:", err);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

app.get("/camps/organizer", async (req, res) => {
  try {
    const email = req.query.email;
    const page = parseInt(req.query.page) || 1; // default to page 1
    const limit = parseInt(req.query.limit) || 10; // default to 5 camps per page
    const skip = (page - 1) * limit;

    if (!email) {
      return res.status(400).json({ error: "Email query param is required" });
    }

    const query = { createdBy: email };

    const [totalCamps, camps] = await Promise.all([
      campsCollection.countDocuments(query),
      campsCollection.find(query).skip(skip).limit(limit).toArray(),
    ]);

    res.json({
      totalCamps,
      page,
      totalPages: Math.ceil(totalCamps / limit),
      camps,
    });
  } catch (err) {
    console.error("Error getting camps by organizer:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

    // camp post API
    app.post("/camp", async (req, res) => {
      const cursor = req.body;
      const result = await campsCollection.insertOne(cursor);
      res.send(result);
    });

    // participant count increment API
app.patch("/camps/increment-participants", async (req, res) => {
  try {
    const { campId, email } = req.body;

    if (!campId || !email) {
      return res.status(400).json({ message: "campId and email are required" });
    }

    const result = await campsCollection.updateOne(
      { _id: new ObjectId(campId) },
      {
        $addToSet: { participantEmails: email }, 
      }
    );

    if (result.modifiedCount === 0) {
      return res
        .status(404)
        .json({ message: "Camp not found or already updated" });
    }

    res.send({ success: true, message: "Participant registered successfully" });
  } catch (error) {
    console.error("Error updating camp participants:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

app.post("/camp-registrations", async (req, res) => {
  try {
    const registration = req.body;
    if (
      !registration ||
      !registration.campId ||
      !registration.participantEmail
    ) {
      return res.status(400).json({ error: "Invalid registration data" });
    }

    // Save registration info
    const result = await registrationsCollection.insertOne({
      ...registration,
      pyamentStatus: "pending",
      createdAt: new Date(),
    });

    // Update participant count in the camp
    await campsCollection.updateOne(
      { _id: new ObjectId(registration.campId) },
      { $inc: { participantCount: 1 } }
    );

    res
      .status(201)
      .json({ success: true, message: "Registered successfully", result });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});


  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("medCamp pro server is running");
});

app.listen(port, () => {
  console.log(`MedCamp Pro Server listening on port ${port}`);
});
