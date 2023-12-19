

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = 4003;                  // External port 24003 forwarded
const gpsdatas_interval = 2000;     // Store 1 GPS data per second for each robot in gpsdatas (max 100)
const gps20datas_interval = 60000;  // Store 1 GPS data per minute for each robot in gps20datas (max 20 per robot)

app.use(cors());

const server = http.createServer(app);
const ws = new WebSocket('ws://************:24101'); // WebSocket server for all robots' GPS data

ws.on('open', function open() {
    console.log('Connected to the WebSocket server.');
});

let lastSavedTimestamp = Date.now(); // Variable to record last save time

ws.on('message', async (message) => {
    // Check time difference between current and last save
    const now = Date.now();
    if (now - lastSavedTimestamp < gpsdatas_interval) {
        return; 
    }

    // Process and store GPS data
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

        lastSavedTimestamp = now; // Update save time

        // Remove oldest entries if count exceeds 100
        const count = await GPSdata.countDocuments();
        if (count > 100) {
            const excessCount = count - 100;
            const oldestEntries = await GPSdata.find().sort('createdAt').limit(excessCount);
            for (let entry of oldestEntries) {
                await GPSdata.deleteOne({ _id: entry._id });
            }
        }
    }
});

// Store 1 GPS data per minute in gps20datas
setInterval(async () => {
    // Fetch and store GPS data for each robot
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

    // Remove oldest entries if count exceeds 160
    const gps20Count = await GPS20data.countDocuments();
    if (gps20Count > 160) {
        const oldestEntries = await GPS20data.find().sort('createdAt').limit(gps20Count - 160);
        for (let entry of oldestEntries) {
            await GPS20data.deleteOne({ _id: entry._id });
        }
    }
}, gps20datas_interval); // 60000 = 1 minute

ws.on('close', function close() {
    console.log('Disconnected from the WebSocket server.');
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// MongoDB connection
const USERNAME = '******';
const PASSWORD = '******';
const DB_URI = `mongodb://${USERNAME}:${PASSWORD}@localhost:******/******?authSource=******`;

mongoose.connect(DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log("Connected to MongoDB");
}).catch(err => {
    console.error("MongoDB connection error:", err);
});

// Schema for storing courses
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

// Schema to store GPS data of all robots in gpsdatas collection
const gpsDataSchema = new mongoose.Schema({
    robotID: String,
    lat: Number,
    lng: Number,
    createdAt: { type: Date, default: Date.now }
});

const GPSdata = mongoose.model('GPSdata', gpsDataSchema);

// Schema for storing 20 GPS data per minute in gps20datas collection
const gps20DataSchema = new mongoose.Schema({
    robotID: String,
    lat: Number,
    lng: Number,
    createdAt: { type: Date, default: Date.now }
});

const GPS20data = mongoose.model('GPS20data', gps20DataSchema);

app.use(express.json());

// Endpoint to save course data
app.post('/save-course', async (req, res) => {
    // Processing course save request
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

// Endpoint to get all courses
app.get('/get-courses', async (req, res) => {
    // Fetching and sending all courses
    try {
        const courses = await Course.find({}, 'trackId category');
        res.status(200).send(courses);
    } catch (err) {
        res.status(500).send({ error: "Failed to retrieve courses" });
    }
});

// Endpoint to get a course by its ID
app.get('/get-course-by-id', async (req, res) => {
    // Fetching and sending a specific course
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

// Endpoint to send a course to a robot
app.post('/send-course-to-robot', async (req, res) => {
    // Sending course data to a robot
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

    fetch(`http://localhost:******/send-mqtt/${robotId}`, {
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

// Endpoint to delete a course
app.get('/delete-course', async (req, res) => {
    // Deleting a course from the database
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

// Endpoint to get the latest location of a robot
app.get('/get-latest-location/:robotID', async (req, res) => {
    // Fetching the latest location of a robot
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

// Retrieve data from the gps20datas collection
app.get('/get-gps20data-for-robot/:robotID', async (req, res) => {
    const robotID = req.params.robotID;  // Retrieve robotID from the route parameter

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
