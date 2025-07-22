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

// Required at top
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = process.env.DB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const database = client.db("MedCampProDB");
const campsCollection = database.collection("camps");
const usersCollection = database.collection("users");
const registrationsCollection = database.collection("registrations");
const paymentsCollection = database.collection("payments");
const feedbackCollection = database.collection("feedback");

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

//  populaar camps get API
app.get("/popular-camps", async (req, res) => {
  const camps = await campsCollection
    .find({ status: "active" })
    .sort({ participantCount: -1 })
    .limit(8)
    .toArray();
  res.send(camps);
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
    const { email, role } = req.query;

    if (!email) {
      return res.status(400).json({ error: "Email query param is required" });
    }

    if (role === "organizer") {
      const count = await campsCollection.countDocuments({ createdBy: email });
      return res.json({ count });
    } else if (role === "participant") {
      const totalParticipant = await registrationsCollection.countDocuments({
        participantEmail: email,
      });
      const totalConfirmationStatus =
        await registrationsCollection.countDocuments({
          participantEmail: email,
          confirmationStatus: "Confirmed",
        });
      const totalPending = totalParticipant - totalConfirmationStatus;
      const count = {
        totalParticipant,
        totalConfirmationStatus,
        totalPending,
      }
      return res.send(count);
    } else {
      return res.status(400).json({ error: "Invalid role" });
    }
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

// Update camp API
app.patch("/update-camp/:id", async (req, res) => {
  const id = req.params.id;
  const updatedCamp = req.body;
  try {
    const result = await campsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedCamp }
    );
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: "Failed to update camp" });
  }
});


// DELETE a camp
app.delete("/delete-camp/:campId", async (req, res) => {
  const { campId } = req.params;

  try {
    const result = await campsCollection.deleteOne({
      _id: new ObjectId(campId),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Camp not found" });
    }

    res.json({ message: "Camp deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete camp" });
  }
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

    res.send({
      success: true,
      message: "Participant registered successfully",
    });
  } catch (error) {
    console.error("Error updating camp participants:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// camp registrations get API with pagination
app.get("/camp-registrations", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await registrationsCollection.countDocuments();
    const registrations = await registrationsCollection
      .find()
      .skip(skip)
      .limit(limit)
      .toArray();

    res.json({
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      registrations,
    });
  } catch (err) {
    console.error("Error fetching paginated registrations:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// camp registration confirmation API
app.patch("/camp-registrations/:id/confirm", async (req, res) => {
  const { id } = req.params;
  try {
    const regUpdate = await registrationsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { confirmationStatus: "Confirmed" } }
    );
    const payUpdate = await paymentsCollection.updateOne(
      { registrationId: id },
      { $set: { confirmationStatus: "Confirmed" } }
    );

    if (regUpdate.modifiedCount > 0 && payUpdate.modifiedCount > 0) {
      res.json({ message: "Registration confirmed" });
    } else {
      res
        .status(404)
        .json({ error: "Registration not found or already confirmed" });
    }
  } catch (err) {
    console.error("Error confirming registration:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// camp registration post API
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
      pyamentStatus: "Unpaid",
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

// Get pyament info from registrations API
app.get("/registrations/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const registration = await registrationsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!registration) {
      return res.status(404).json({ error: "Registration not found" });
    }

    res.send(registration);
  } catch (err) {
    console.error("Error fetching registration:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// Delete registration API
app.delete("/delete-registrations", async (req, res) => {
  try {
    const { id, campID, email } = req.query;

    if (!id || !campID || !email) {
      return res
        .status(400)
        .json({ error: "Missing required query parameters" });
    }

    // Delete from registrations collection
    const regResult = await registrationsCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (regResult.deletedCount === 0) {
      return res.status(404).json({ error: "Registration not found" });
    }

    // Update the camp: remove participantEmail and decrement participantCount
    const updateResult = await campsCollection.updateOne(
      { _id: new ObjectId(campID) },
      {
        $pull: { participantEmails: email },
        $inc: { participantCount: -1 },
      }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(404).json({ error: "Camp not found or not updated" });
    }

    res.json({ message: "Registration deleted and camp updated successfully" });
  } catch (err) {
    console.error("Error deleting registration and updating camp:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get participant registrations by email
app.get("/participant-registrations", async (req, res) => {
  try {
    const email = req.query.email;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    if (!email) {
      return res.status(400).send({ message: "Email is required" });
    }

    const skip = (page - 1) * limit;

    const query = { participantEmail: email };
    const total = await registrationsCollection.countDocuments(query);

    const registrations = await registrationsCollection
      .find(query)
      .skip(skip)
      .limit(limit)
      .sort({ registeredAt: -1 })
      .toArray();

    res.send({
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      registrations,
    });
  } catch (error) {
    res.status(500).send({ message: "Server error", error: error.message });
  }
});

// GET participant analytics data for chart (campName & fees)
app.get("/participant-analytics", async (req, res) => {
  try {
    const email = req.query.email;

    if (!email) {
      return res.status(400).json({ error: "Participant email is required" });
    }

    const query = { participantEmail: email };

    const registrations = await registrationsCollection.find(query).toArray();

    res.json(registrations);
  } catch (error) {
    console.error("Error fetching analytics data:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route: POST /create-payment-intent
app.post("/create-payment-intent", async (req, res) => {
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // convert to cents
      currency: "usd",
      payment_method_types: ["card"],
    });

    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error("Stripe Error:", error);
    res.status(500).json({ error: "Failed to create payment intent" });
  }
});

app.post("/payments", async (req, res) => {
  const payment = req.body;

  try {
    const result = await paymentsCollection.insertOne(payment);
    res.send({ success: true, insertedId: result.insertedId });
  } catch (error) {
    console.error("Insert payment error:", error);
    res.status(500).send({ success: false, message: "Failed to save payment" });
  }
});

// Update registration payment status API
app.patch("/registrations/:id", async (req, res) => {
  const registrationId = req.params.id;

  const updateDoc = {
    $set: {
      pyamentStatus: "Paid",
    },
  };

  try {
    const result = await registrationsCollection.updateOne(
      { _id: new ObjectId(registrationId) },
      updateDoc
    );

    if (result.modifiedCount > 0) {
      res.send({ success: true });
    } else {
      res
        .status(404)
        .send({
          success: false,
          message: "Registration not found or not updated",
        });
    }
  } catch (error) {
    console.error("Update registration error:", error);
    res
      .status(500)
      .send({ success: false, message: "Failed to update registration" });
  }
});

// Get payment history by participant email with Pagination
app.get("/payment-history", async (req, res) => {
  try {
    const { email } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { participantEmail: email };

    const total = await paymentsCollection.countDocuments(query);
    const payments = await paymentsCollection
      .find(query)
      .skip(skip)
      .limit(limit)
      .toArray();

    res.json({
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      payments,
    });
  } catch (err) {
    console.error("Error fetching paginated payment history:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Feedback collection
app.post("/feedback", async (req, res) => {
  try {
    const feedback = req.body;
    feedback.createdAt = new Date().toISOString();

    const result = await feedbackCollection.insertOne(feedback);
    res.json({
      success: true,
      message: "Feedback submitted",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Error submitting feedback:", error);
    res.status(500).json({ error: "Failed to submit feedback" });
  }
});

app.get("/", (req, res) => {
  res.send("medCamp pro server is running");
});

app.listen(port, () => {
  console.log(`MedCamp Pro Server listening on port ${port}`);
});
