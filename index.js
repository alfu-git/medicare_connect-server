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
    const doctorCollection = db.collection("doctors");

    ////////// DOCTOR //////////
    // PUBLIC API----->
    // get all doctors
    app.get("/doctors", async (req, res) => {
      const queryString = req.query;

      let query = {};

      const cursor = doctorCollection.find(query);
      const result = await cursor.toArray();
      res.json(result);
    });

    // get doctor by id
    app.get("/doctors/:doctorId", async (req, res) => {
      const doctorId = req.params;

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
