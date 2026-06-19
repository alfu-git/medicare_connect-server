const dns = require("node:dns");
dns.setServers(["1.1.1.1", "8.8.4.4"]);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
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
    const doctorCollection = db.collection("doctors");
    const appointmentCollection = db.collection("appointments");
    const reviewCollection = db.collection("reviews");
    const paymentCollection = db.collection("payments");
    const prescriptionCollection = db.collection("prescriptions");

    ////////// DOCTOR //////////
    // PUBLIC API----->
    // get all doctors
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

    // get doctor by id
    app.get("/doctors/:doctorId", async (req, res) => {
      const { doctorId } = req.params;

      const query = {
        _id: new ObjectId(doctorId),
      };

      const result = await doctorCollection.findOne(query);
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
