// Add second server code below : PostgreSQL connection

const express = require('express');
const mongoose = require('mongoose');
const { Pool } = require('pg');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = 4003;
const gpsdatas_interval = 2000;
const gps20datas_interval = 60000;

// Database settings
const MONGO_DATABASE = "********";
const POSTGRES_DATABASE = "********";
const POSTGRES_COLLECTION = "********";

// Allow requests from a specific domain
const corsOptions = {
    origin: 'http://********:********',
    credentials: true,
};

app.use(cors(corsOptions));

const server = http.createServer(app);
const ws = new WebSocket('ws://********:********'); // Receives GPS data from all robots on port 24101.

ws.on('open', function open() {
    console.log('Connected to the WebSocket server.');
});

let lastSavedTimestamp = Date.now(); // Variable to record the last saved time (to control saving frequency)

ws.on('message', async (message) => {
    try {
        // Check the time difference between the current time and the last saved time
        const now = Date.now();
        if (now - lastSavedTimestamp < gpsdatas_interval) {
            return;
        }

        const msg = JSON.parse(message);
        const robotIDPattern = /\/ecobot(\d{5})\/gps_location/;
        const matches = robotIDPattern.exec(msg.topic);

        if (matches) {
            const gpsMessage = JSON.parse(msg.message);
            const gpsData = {
                robotID: `robot${matches[1]}`,
                lat: gpsMessage.latitude,
                lng: gpsMessage.longitude
            };

            const newGpsData = new GPSdata(gpsData);
            await newGpsData.save();
            console.log("Received and Saved GPS Data:", gpsData);

            lastSavedTimestamp = now; // Update the saving time

            const count = await GPSdata.countDocuments();
            if (count > 100) {
                const excessCount = count - 100;
                const oldestEntries = await GPSdata.find().sort('createdAt').limit(excessCount);
                for (let entry of oldestEntries) {
                    await GPSdata.deleteOne({ _id: entry._id });
                }
            }
        }
    } catch (error) {
        console.error("Error processing GPS data:", error);
    }
});

// Insert 1 GPS20 data entry every 1 minute
setInterval(async () => {
    try {
        const robotIds = [
            "robot00001", "robot00002", "robot00003", "robot00004",
            "robot00005", "robot00006", "robot00007", "robot00008"
        ];

        for (let robotID of robotIds) {
            const lastEntry = await GPSdata.findOne({ robotID }).sort('-createdAt').limit(1);
            if (lastEntry) {
                const newGps20Data = new GPS20data({
                    robotID: lastEntry.robotID,
                    lat: lastEntry.lat,
                    lng: lastEntry.lng
                });
                await newGps20Data.save();
            }
        }

        const gps20Count = await GPS20data.countDocuments();
        if (gps20Count > 160) {
            const oldestEntries = await GPS20data.find().sort('createdAt').limit(gps20Count - 160);
            for (let entry of oldestEntries) {
                await GPS20data.deleteOne({ _id: entry._id });
            }
        }
    } catch (error) {
        console.error("Error processing GPS20 data:", error);
    }
}, gps20datas_interval); // 60000 = 1 minute

ws.on('close', function close() {
    console.log('Disconnected from the WebSocket server.');
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Connect to MongoDB
const USERNAME = '********';
const PASSWORD = '********';
const DB_URI = `mongodb://${USERNAME}:${PASSWORD}@localhost:********/${MONGO_DATABASE}?authSource=********`;

mongoose.connect(DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log("Connected to MongoDB");
}).catch(err => {
    console.error("MongoDB connection error:", err);
});

const courseSchema = new mongoose.Schema({
    trackId: { type: String, required: true, unique: true },
    category: { type: String, required: true },
    locations: [{
        id: Number,
        lat: Number,
        lng: Number
    }],
});

const Course = mongoose.model('Course', courseSchema);

const gpsDataSchema = new mongoose.Schema({
    robotID: String,
    lat: Number,
    lng: Number,
    createdAt: { type: Date, default: Date.now }
});

// Schema for storing GPS data for all robots in the gpsdatas collection
const GPSdata = mongoose.model('GPSdata', gpsDataSchema);

// Schema for storing 20 GPS data points every 1 minute in the gps20datas collection
const gps20DataSchema = new mongoose.Schema({
    robotID: String,
    lat: Number,
    lng: Number,
    createdAt: { type: Date, default: Date.now }
});

// Schema for the gps20 collection to store, every 1 minute
const GPS20data = mongoose.model('GPS20data', gps20DataSchema);


app.use(express.json());

app.post('/save-course', async (req, res) => {
    console.log("Received Request Body:", req.body);
    try {
        const { trackId, category, locations } = req.body;
        const course = new Course({ trackId, category, locations });
        await course.save();
        res.status(201).send({ message: "Course saved successfully!" });
    } catch (err) {
        console.error("Error while saving to MongoDB:", err);
        res.status(500).send({ error: "Failed to save the course" });
    }
});

app.get('/get-courses', async (req, res) => {
    try {
        const courses = await Course.find({}, 'trackId category');
        res.status(200).send(courses);
    } catch (err) {
        res.status(500).send({ error: "Failed to retrieve courses" });
    }
});

app.get('/get-course-by-id', async (req, res) => {
    try {
        const { trackId } = req.query;
        const course = await Course.findOne({ trackId });
        if (!course) {
            return res.status(404).send({ error: "Course not found" });
        }
        res.status(200).send(course);
    } catch (err) {
        res.status(500).send({ error: "Failed to retrieve course" });
    }
});

app.post('/send-course-to-robot', async (req, res) => {
    const { trackId, repeat_count, robotId } = req.body;

    const course = await Course.findOne({ trackId });
    if (!course) {
        return res.status(404).send({ error: "Course not found" });
    }

    const fetch = require('node-fetch');
    
    const mqttPayload = {
        topics: [
            {
                topic: 'track',
                payload: JSON.stringify({ ...course.toObject(), repeat_count: parseInt(repeat_count) })
            }
        ]
    };

    fetch(`http://localhost:4001/send-mqtt/${robotId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(mqttPayload)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error("Failed to send MQTT message");
        }
        return response.json();
    })
    .then(data => {
        res.status(200).send(data);
    })
    .catch(error => {
        console.error('Error sending MQTT message:', error);
        res.status(500).send({ error: "Failed to send MQTT message" });
    });
});

app.get('/delete-course', async (req, res) => {
    try {
        const { trackId } = req.query;
        const result = await Course.deleteOne({ trackId });
        if (result.deletedCount === 0) {
            return res.status(404).send({ error: "Course not found" });
        }
        res.status(200).send({ message: "Successfully deleted course" });
    } catch (err) {
        res.status(500).send({ error: "Failed to delete course" });
    }
});

// load current GPs data
app.get('/get-latest-location/:robotID', async (req, res) => {
    const { robotID } = req.params;
    try {
        const latestEntry = await GPSdata.findOne({ robotID }).sort('-createdAt').limit(1);
        if (latestEntry) {
            res.status(200).send({
                lat: latestEntry.lat,
                lng: latestEntry.lng
            });
        } else {
            res.status(404).send({ error: "No data found for given robotID" });
        }
    } catch (err) {
        console.error("Error fetching latest robot location:", err);
        res.status(500).send({ error: "Failed to fetch the latest robot location" });
    }
});

// load GPS data from gps20datas collection(mongoDB) 
app.get('/get-gps20data-for-robot/:robotID', async (req, res) => {
    const robotID = req.params.robotID;  

    if (!robotID.startsWith('robot0000') || robotID.length !== 10) {
        return res.status(400).send({ error: "Invalid robotID format" });
    }

    try {
        const gpsDatas = await GPS20data.find({ robotID: robotID });
        res.status(200).send(gpsDatas);
    } catch (err) {
        console.error(`Error retrieving GPS20 data for ${robotID}:`, err);
        res.status(500).send({ error: `Failed to retrieve GPS20 data for ${robotID}` });
    }
});


// Add second server 
// Connect to PostgreSQL database
const pool = new Pool({
    user: '********',
    host: '********',
    database: POSTGRES_DATABASE,
    password: '********',
    port: 5432,
});

// Add route using PostgreSQL database 
app.get('/get-water-********', async (req, res) => {
  const date = req.query.date;
  try {
    const result = await pool.query(`
      SELECT timestamp, latitude, longitude 
      FROM ${POSTGRES_COLLECTION}
      WHERE DATE(timestamp) = to_date($1, 'YYYY-MM-DD')
      ORDER BY timestamp`, 
      [date]
    );

    const cleanedData = result.rows.filter(row => {
      // Check if both latitude and longitude are numbers
      return !isNaN(row.latitude) && !isNaN(row.longitude);
    }).map(row => {
      return {
        timestamp: row.timestamp,
        latitude: row.latitude,
        longitude: row.longitude,
      };
    });

    res.json(cleanedData);
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong');
  }
});
