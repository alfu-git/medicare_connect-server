const dns = require("node:dns");
dns.setServers(["1.1.1.1", "8.8.4.4"]);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    // all collections
    const db = client.db("medicare-db");
    const userCollection = db.collection("user");
    const paymentCollection = db.collection("payments");
    const appointmentCollection = db.collection("appointments");
    const favDoctorCollection = db.collection("favorite-doctors");
    const doctorCollection = db.collection("doctors");
    const reviewCollection = db.collection("reviews");
    const prescriptionCollection = db.collection("prescriptions");

    // token verify
    const JWKS = createRemoteJWKSet(
      new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
    );

    const verifyToken = async (req, res, next) => {
      const authHeader = req.headers?.authorization;

      if (!authHeader) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const token = authHeader.split(" ")[1];

      if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      try {
        const { payload } = await jwtVerify(token, JWKS);
        req.user = payload;
        next();
      } catch (err) {
        console.log(err);
        return res.status(401).send({ message: "unauthorized access" });
      }
    };

    //-------------------------------------- PATIENT ---------------------------------------//

    // patient verify
    const verifyPatient = async (req, res, next) => {
      if (req?.user?.role !== "patient") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // doctor verify
    const verifyDoctor = async (req, res, next) => {
      if (req?.user?.role !== "doctor") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // admin verify
    const verifyAdmin = async (req, res, next) => {
      if (req?.user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // get all doctors (public)
    app.get("/doctors", async (req, res) => {
      const { page = 1, limit = 5 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      let query = {};
      let sortOption = {};

      // search
      if (req.query.search) {
        query.$or = [
          { doctorName: { $regex: req.query.search, $options: "i" } },
          {
            specialization: { $regex: req.query.search, $options: "i" },
          },
        ];
      }

      if (req.query.sortBy) {
        const sortField = req.query.sortBy;

        if (sortField === "fee") {
          sortOption = { consultationFee: 1 };
        }

        if (sortField === "experience") {
          sortOption = { experience: -1 };
        }

        if (sortField === "rating") {
          sortOption = { rating: -1 };
        }
      }

      const cursor = doctorCollection
        .find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(Number(limit));
      const result = await cursor.toArray();

      const totalData = await doctorCollection.countDocuments();
      const totalPage = Math.ceil(totalData / Number(limit));

      res.json({ data: result, page: Number(page), totalPage, totalData });
    });

    // get doctor by id (public)
    app.get("/doctors/:doctorId", async (req, res) => {
      const { doctorId } = req.params;

      const query = {
        _id: new ObjectId(doctorId),
      };

      const result = await doctorCollection.findOne(query);
      res.json(result);
    });

    // get appointments by patient id (private)
    app.get(
      "/appointments/:patientId",
      verifyToken,
      verifyPatient,
      async (req, res) => {
        const { patientId } = req.params;

        if (req.user.id !== patientId) {
          return res.status(403).send({ message: "forbidden access" });
        }

        const query = {
          patientId: patientId,
        };
        const result = await appointmentCollection.find(query).toArray();
        res.json(result);
      },
    );

    // get appointment by appointment id
    app.get(
      "/appointment/:appointmentId",
      verifyToken,
      verifyPatient,
      async (req, res) => {
        const { appointmentId } = req.params;
        const query = {
          _id: new ObjectId(appointmentId),
        };

        const appointment = await appointmentCollection.findOne(query);
        console.log("appointment.patientId: ", appointment.patientId);
        console.log("req.user.id: ", req.user.id);

        if (appointment.patientId !== req.user.id) {
          return res.status(403).send({ message: "forbidden access" });
        }

        res.json(appointment);
      },
    );

    // post appointments (private)
    app.post("/appointments", verifyToken, verifyPatient, async (req, res) => {
      const appointmentDoc = req.body;
      const { paymentId } = appointmentDoc;

      const appointment = {
        ...appointmentDoc,
        createdAt: new Date(),
      };

      // 1. Insert appointment
      const result = await appointmentCollection.insertOne(appointment);
      const appointmentId = result?.insertedId.toString();

      // 2. Search payment doc
      const paymentSearchQuery = {
        _id: new ObjectId(paymentId),
      };

      const expectedPaymentDoc =
        await paymentCollection.findOne(paymentSearchQuery);

      // 3. Insert appointmentId to payment doc
      if (expectedPaymentDoc) {
        await paymentCollection.updateOne(paymentSearchQuery, {
          $set: {
            appointmentId: appointmentId,
          },
        });
      }

      res.json(result);
    });

    // update appointment (private)
    app.patch(
      "/appointments/:appointmentId",
      verifyToken,
      verifyPatient,
      async (req, res) => {
        const { appointmentId } = req.params;
        const updatedAppointment = req.body;

        const query = {
          _id: new ObjectId(appointmentId),
        };

        const appointment = await appointmentCollection.findOne(query);

        if (appointment.patientId !== req.user.id) {
          return res.status(403).send({ message: "forbidden access" });
        }

        const result = await appointmentCollection.updateOne(query, {
          $set: updatedAppointment,
        });
        res.json(result);
      },
    );

    // delete appointment (private)
    app.delete(
      "/appointments/:appointmentId",
      verifyToken,
      verifyPatient,
      async (req, res) => {
        const { appointmentId } = req.params;
        const query = {
          _id: new ObjectId(appointmentId),
        };

        const appointment = await appointmentCollection.findOne(query);

        if (appointment.patientId !== req.user.id) {
          return res.status(403).send({ message: "forbidden access" });
        }

        const result = await appointmentCollection.deleteOne(query);

        await paymentCollection.deleteOne({ appointmentId });

        res.json(result);
      },
    );

    // get payments by patient id (private)
    app.get(
      "/payments/:patientId",
      verifyToken,
      verifyPatient,
      async (req, res) => {
        const { patientId } = req.params;

        if (req.user.id !== patientId) {
          return res.status(403).send({ message: "forbidden access" });
        }

        const query = {
          patientId: patientId,
        };
        const result = await paymentCollection.find(query).toArray();
        res.json(result);
      },
    );

    // post payment (private)
    app.post("/payments", verifyToken, verifyPatient, async (req, res) => {
      const {
        patientId,
        doctorId,
        doctorName,
        consultationFee,
        sessionId,
        transactionId,
      } = req.body;

      const isExists = await paymentCollection.findOne({
        sessionId,
      });

      if (isExists) {
        return res.json({ message: "session is already exists!" });
      }

      const result = await paymentCollection.insertOne({
        patientId,
        doctorId,
        doctorName,
        consultationFee,
        sessionId,
        transactionId,
        paymentDate: new Date(),
      });
      res.json({ insertedId: result?.insertedId });
    });

    // get patient favorite doctors (private)
    app.get(
      "/favorite-doctors/:patientId",
      verifyToken,
      verifyPatient,
      async (req, res) => {
        const { patientId } = req.params;

        if (req.user.id !== patientId) {
          return res.status(403).send({ message: "forbidden access" });
        }

        const query = {
          patientId: patientId,
        };
        const result = await favDoctorCollection.find(query).toArray();
        res.json(result);
      },
    );

    //---------------------------------------- DOCTOR ----------------------------------------//
    // get all patient by doctor id
    app.get(
      "/patients/:doctorId",
      verifyToken,
      verifyDoctor,
      async (req, res) => {
        const { doctorId } = req.params;

        if (req.user.id !== doctorId) {
          return res.status(403).send({ message: "forbidden access" });
        }

        // 1. find all appointments of this doctor
        const appointments = await appointmentCollection
          .find({ doctorId })
          .toArray();

        // 2. extract unique patientIds
        const patientIds = [
          ...new Set(appointments.map((app) => app.patientId)),
        ];

        const objectIds = patientIds.map((id) => new ObjectId(id));

        // 3. find patients from Users collection
        const patients = await userCollection
          .find({
            _id: { $in: objectIds },
            role: "patient",
          })
          .toArray();

        res.send(patients);
      },
    );

    // post doctor data
    app.post("/doctors", verifyToken, verifyDoctor, async (req, res) => {
      const doctorData = req.body;

      const result = await doctorCollection.insertOne(doctorData);

      await userCollection.updateOne(
        { _id: new ObjectId(doctorData.userId) },
        { $set: { profileComplete: true } },
      );

      res.json(result);
    });

    // get appointments by doctor id
    app.get(
      "/doctor-appointments/:doctorId",
      verifyToken,
      verifyDoctor,
      async (req, res) => {
        const { doctorId } = req.params;

        if (req.user.id !== doctorId) {
          return res.status(403).send({ message: "forbidden access" });
        }

        const result = await appointmentCollection.find({ doctorId }).toArray();

        res.json(result);
      },
    );

    // get all payments of a specific doctor
    app.get(
      "/doctor-payments/:doctorId",
      verifyToken,
      verifyDoctor,
      async (req, res) => {
        const { doctorId } = req.params;

        if (req.user.id !== doctorId) {
          return res.status(403).send({ message: "forbidden access" });
        }

        const result = await paymentCollection.find({ doctorId }).toArray();
        res.json(result);
      },
    );

    // get reviews by doctor id
    app.get(
      "/doctor-reviews/:doctorId",
      verifyToken,
      verifyDoctor,
      async (req, res) => {
        const { doctorId } = req.params;

        if (req.user.id !== doctorId) {
          return res.status(403).send({ message: "forbidden access" });
        }

        const result = await reviewCollection.find({ doctorId }).toArray();
        res.json(result);
      },
    );

    ////////// USER //////////
    app.get("/user/:userId", async (req, res) => {
      const { userId } = req.params;

      const query = {
        _id: new ObjectId(userId),
      };

      const result = await userCollection.findOne(query);
      res.json(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
