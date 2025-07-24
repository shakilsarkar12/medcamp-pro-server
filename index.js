require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
const admin = require("firebase-admin");
const serviceAccount = require("./firebase-admin.json");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// MongoDB connection
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
const contactMessagesCollection = database.collection("contactMessages");

// Firebase Admin initialize
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Middleware to verify Firebase token and attach user role
const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log(authHeader);
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;

    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
};

// Middleware to check user role
const checkRole = (role) => async (req, res, next) => {
  const email = req.query.email;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const user = await usersCollection.findOne({ email });
    if (user && user.role === role) {
      return next();
    }
    return res.status(403).json({ error: "Forbidden: Insufficient role" });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

app.use(
  cors({
    origin: ["http://localhost:5173", "https://medcamp-pro.web.app"],
    credentials: true,
  })
);
app.use(express.json());

// Required at top
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// user Get APi
app.get(
  "/users",
  verifyFirebaseToken,
  checkRole("organizer"),
  async (req, res) => {
    const cursor = usersCollection.find();
    const result = await cursor.toArray();
    res.send(result);
  }
);

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

  if (exitingUser) {
    res.send(exitingUser);
  } else {
    const result = await usersCollection.insertOne(cursor);
    res.send(result);
  }
});

// user role update API
app.put("/user", verifyFirebaseToken, async (req, res) => {
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
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    const search = req.query.search || "";
    const sort = req.query.sort || "";
    const date = req.query.date || "";

    const skip = (page - 1) * limit;
    const query = {};

    if (search) {
      query.$or = [
        { campName: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
        { doctor: { $regex: search, $options: "i" } },
      ];
    }
    if (date) {
      query.scheduledDate = date;
    }

    // In your /camps API
    let sortObj = {};
    if (sort === "most-registered") sortObj = { participantCount: -1 };
    else if (sort === "fees-low-high") sortObj = { fees: 1 };
    else if (sort === "fees-high-low") sortObj = { fees: -1 };
    else if (sort === "alphabetical") sortObj = { campName: 1 };

    const total = await campsCollection.countDocuments(query);
    const camps = await campsCollection
      .find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .toArray();

    res.json({
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      camps,
    });
  } catch (err) {
    console.error("Error fetching camps:", err);
    res.status(500).json({ error: "Internal server error" });
  }
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
app.get(
  "/camps/count",
  verifyFirebaseToken,
  async (req, res) => {
    try {
      const { email, role } = req.query;

      if (!email) {
        return res.status(400).json({ error: "Email query param is required" });
      }

      if (role === "organizer") {
        const count = await campsCollection.countDocuments({
          createdBy: email,
        });
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
        };
        return res.send(count);
      } else {
        return res.status(400).json({ error: "Invalid role" });
      }
    } catch (err) {
      console.error("Error getting camp count:", err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

app.get(
  "/camps/organizer",
  verifyFirebaseToken,
  checkRole("organizer"),
  async (req, res) => {
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
  }
);

// camp post API
app.post(
  "/camp",
  verifyFirebaseToken,
  checkRole("organizer"),
  async (req, res) => {
    const cursor = req.body;
    const result = await campsCollection.insertOne(cursor);
    res.send(result);
  }
);

// Update camp API
app.patch(
  "/update-camp/:id",
  verifyFirebaseToken,
  checkRole("organizer"),
  async (req, res) => {
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
  }
);

// DELETE a camp
app.delete(
  "/delete-camp/:campId",
  verifyFirebaseToken,
  checkRole("organizer"),
  async (req, res) => {
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
  }
);

// participant count increment API
app.patch(
  "/camps/increment-participants",
  verifyFirebaseToken,
  async (req, res) => {
    try {
      const { campId, email } = req.body;

      if (!campId || !email) {
        return res
          .status(400)
          .json({ message: "campId and email are required" });
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
  }
);

// camp registrations get API with pagination
app.get("/camp-registrations", verifyFirebaseToken, async (req, res) => {
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
app.patch(
  "/camp-registrations/:id/confirm",
  verifyFirebaseToken,
  checkRole("organizer"),
  async (req, res) => {
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
  }
);

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
app.get("/registrations/:id", verifyFirebaseToken, async (req, res) => {
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
app.delete(
  "/delete-registrations",
  verifyFirebaseToken,
  checkRole("organizer"),
  async (req, res) => {
    try {
      const { id, campID, participantEmail } = req.query;

      if (!id || !campID || !participantEmail) {
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
          $pull: { participantEmails: participantEmail },
          $inc: { participantCount: -1 },
        }
      );

      if (updateResult.modifiedCount === 0) {
        return res.status(404).json({ error: "Camp not found or not updated" });
      }

      res.json({
        message: "Registration deleted and camp updated successfully",
      });
    } catch (err) {
      console.error("Error deleting registration and updating camp:", err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

// Get participant registrations by email
app.get("/participant-registrations", verifyFirebaseToken, async (req, res) => {
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
app.get("/participant-analytics", verifyFirebaseToken, async (req, res) => {
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
app.post("/create-payment-intent", verifyFirebaseToken, async (req, res) => {
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

app.post("/payments", verifyFirebaseToken, async (req, res) => {
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
app.patch("/registrations/:id", verifyFirebaseToken, async (req, res) => {
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
      res.status(404).send({
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

app.get("/feedbacks", async (req, res) => {
  const feedbacks = await feedbackCollection.find().limit(12).toArray();
  res.send(feedbacks);
});

// Feedback collection
app.post("/feedback", verifyFirebaseToken, async (req, res) => {
  try {
    const feedback = req.body;
    feedback.submittedAt = new Date().toISOString();

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

// Dashboard participant overview API
app.get(
  "/dashboard/participant-overview",
  verifyFirebaseToken,
  async (req, res) => {
    const email = req.query.email;

    try {
      if (!email) {
        return res.status(400).send({ error: "Email is required" });
      }

      const totalRegisterCamps = await registrationsCollection.countDocuments({
        participantEmail: email,
      });

      const registered = await registrationsCollection
        .find({ participantEmail: email })
        .sort({ createdAt: -1 })
        .limit(3)
        .toArray();

      const feedbacks = await feedbackCollection
        .find({ participantEmail: email })
        .toArray();

      const payments = await paymentsCollection
        .find({ participantEmail: email })
        .toArray();

      const today = new Date().toISOString().split("T")[0];

      const upcomingCamps = await campsCollection
        .find({
          participantEmails: email,
          scheduledDate: { $gt: today },
        })
        .toArray();

      res.send({
        totalRegisterCamps,
        registered,
        feedbacks,
        payments,
        upcomingCamps,
      });
    } catch (err) {
      console.error("Dashboard Error:", err);
      res.status(500).send({ error: "Failed to fetch dashboard stats" });
    }
  }
);

// Dashboard organizer overview API
app.get(
  "/dashboard/organizer-overview",
  verifyFirebaseToken,
  checkRole("organizer"),
  async (req, res) => {
    try {
      const email = req.query.email;
      if (!email) return res.status(400).send({ message: "Email is required" });

      const camps = await campsCollection.find({ createdBy: email }).toArray();
      const campIds = camps.map((camp) => camp._id);

      // Get all registrations for this organizer's camps
      const registrations = await registrationsCollection
        .find({ campId: { $in: campIds.map((id) => id.toString()) } })
        .toArray();

      const now = new Date();
      const upcomingCamps = camps.filter(
        (camp) => new Date(camp.scheduledDate) > now
      );

      // Get all payments for this organizer's camps
      const payments = await paymentsCollection
        .find({ campId: { $in: campIds.map((id) => id.toString()) } })
        .toArray();

      // Calculate total revenue from payments
      const totalRevenue = payments.reduce((sum, payment) => {
        return sum + parseFloat(payment.amount || 0);
      }, 0);

      // Count participants per camp
      const campStats = camps.map((camp) => {
        const participantCount = registrations.filter(
          (reg) => reg.campId === camp._id.toString()
        ).length;
        // Calculate revenue for this camp from payments
        const campPayments = payments.filter(
          (payment) => payment.campId === camp._id.toString()
        );
        const revenue = campPayments.reduce(
          (sum, payment) => sum + parseFloat(payment.amount || 0),
          0
        );

        return {
          _id: camp._id,
          campName: camp.campName,
          participantCount,
          revenue,
        };
      });

      // Sort by participant count and return top 5
      const topCamps = campStats
        .sort((a, b) => b.participantCount - a.participantCount)
        .slice(0, 5);

      // --- Recent Activity Section ---
      // Example: last 10 registrations and payments
      const recentRegistrations = registrations
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5)
        .map(
          (reg) =>
            `New registration: ${reg.participantName} joined ${reg.campName}`
        );

      const recentPayments = payments
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5)
        .map((pay) => `Payment received: $${pay.amount} for ${pay.campName}`);

      const recentActivity = [...recentRegistrations, ...recentPayments].sort(
        () => Math.random() - 0.5
      );

      // Count camps joined per participant
      const participantMap = {};
      registrations.forEach((reg) => {
        if (!participantMap[reg.participantEmail]) {
          participantMap[reg.participantEmail] = {
            name: reg.participantName,
            email: reg.participantEmail,
            campsJoined: 0,
          };
        }
        participantMap[reg.participantEmail].campsJoined += 1;
      });
      const topParticipants = Object.values(participantMap)
        .sort((a, b) => b.campsJoined - a.campsJoined)
        .slice(0, 5);

      res.send({
        totalOrganizedCamps: camps.length,
        upcomingCamps: upcomingCamps.length,
        totalParticipants: registrations.length,
        totalRevenue,
        topCamps,
        recentActivity,
        topParticipants,
      });
    } catch (err) {
      console.error("Error fetching organizer stats:", err);
      res.status(500).send({ message: "Internal Server Error" });
    }
  }
);

// Example Express API endpoint for contact messages
app.post("/contact-messages", async (req, res) => {
  try {
    const contactData = req.body;
    if (!contactData) {
      return res
        .status(400)
        .json({ success: false, error: "All fields are required." });
    }

    contactData.createdAt = new Date().toISOString();

    // Save to MongoDB collection (replace with your collection name)
    const result = await contactMessagesCollection.insertOne(contactData);

    res.json({ success: true, insertedId: result.insertedId });
  } catch {
    res.status(500).json({ success: false });
  }
});

app.get("/", (req, res) => {
  res.send("medCamp pro server is running");
});

app.listen(port, () => {
  console.log(`MedCamp Pro Server listening on port ${port}`);
});
