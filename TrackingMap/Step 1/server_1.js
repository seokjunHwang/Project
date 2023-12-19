const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
const PORT = 4003; // Forwarded to external port 24003

// Configure CORS: Allowing requests from different domains
app.use(cors());

// Start the server: Running on the specified port
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Configure MongoDB connection
const USERNAME = '*********';
const PASSWORD = '*********';
const DB_URI = `mongodb://${USERNAME}:${PASSWORD}@localhost:********/'*********';?authSource='*********';`;

// Connect to MongoDB: Using useNewUrlParser and useUnifiedTopology options
mongoose.connect(DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log("Connected to MongoDB");
}).catch(err => {
    console.error("MongoDB connection error:", err);
});

// ------ Define Schemas -------

// Course Schema: Defines the data format for storing robot's movement paths (= the message format sent to the robot)
const courseSchema = new mongoose.Schema({
    trackId: { type: String, required: true, unique: true },
    category: { type: String, required: true }, // Adding a category field
    locations: [{
        id: Number,
        lat: Number,
        lng: Number
    }],
});
// Create a collection using the schema defined above
const Course = mongoose.model('Course', courseSchema);

// Schema for storing orange markers (path locations) on the tracking map
const orangeDotSchema = new mongoose.Schema({
    lat: Number,
    lng: Number,
    createdAt: { type: Date, default: Date.now }  // Created timestamp (for later data cleanup)
});

// Create a collection for paths using the schema defined above
const OrangeDot = mongoose.model('OrangeDot', orangeDotSchema, 'course_20');

// ------ Define API Endpoints ------

app.use(express.json());

// Save a course: Store new course data in MongoDB
app.post('/save-course', async (req, res) => {
    console.log("Received Request Body:", req.body); // Log the request body
    try {
        const { trackId, category, locations } = req.body; // Adding the category variable
        const course = new Course({ trackId, category, locations }); // Creating a course with the category variable
        await course.save();
        res.status(201).send({ message: "Course saved successfully!" });
    } catch (err) {
        // Log errors
        console.error("Error while saving to MongoDB:", err);
        res.status(500).send({ error: "Failed to save the course" });
    }
});

// Get all courses from MongoDB
app.get('/get-courses', async (req, res) => {
    try {
        const courses = await Course.find({}, 'trackId category');  // Also return category information
        res.status(200).send(courses);
    } catch (err) {
        res.status(500).send({ error: "Failed to retrieve courses" });
    }
});

// Get a specific course marker from MongoDB
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

// Send course information to the robot (from MongoDB to the robot)
app.post('/send-course-to-robot', async (req, res) => {
    const { trackId, repeat_count, robotId } = req.body;

    // Fetch the course from MongoDB
    const course = await Course.findOne({ trackId });
    if (!course) {
        return res.status(404).send({ error: "Course not found" });
    }

    // Send the course data and repeat_count to the robot
    const fetch = require('node-fetch');
    
    const mqttPayload = {
        topics: [
            {
                topic: 'track',
                payload: JSON.stringify({ ...course.toObject(), repeat_count: parseInt(repeat_count) }) // Add repeat_count to payload
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
            throw an Error("Failed to send MQTT message");
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

// Delete a course
app.get('/delete-course', async (req, res) => {
    try {
        const { trackId } = req.query;
        
        // Find and delete the course with the specified trackId
        const result = await Course.deleteOne({ trackId });

        // If no document was deleted, i.e., no course with the specified trackId was found
        if (result.deletedCount === 0) {
            return res.status(404).send({ error: "Course not found" });
        }

        // If the deletion was successful, return a success message
        res.status(200).send({ message: "Successfully deleted course" });

    } catch (err) {
        // If an error occurs, return a 500 error
        res.status(500).send({ error: "Failed to delete course" });
    }
});

// Save orange markers (path locations) in MongoDB
app.post('/save-orange-dot', async (req, res) => {
    try {
        const { lat, lng } = req.body;

        const newOrangeDot = new OrangeDot({ lat, lng });
        await newOrangeDot.save();

        // Check if there are more than 10 data points
        const count = await OrangeDot.countDocuments();
        console.log(`Orange dot saved. Total count: ${count}`);  // Add a log here!

        let deletedCount = 0;  // Number of deleted data points

        if (count > 10) {
            const exceedingDots = count - 10; 
            const oldestDots = await OrangeDot.find().sort('createdAt').limit(exceedingDots);

            for (let dot of oldestDots) {
                await dot.remove();
            }
            deletedCount = oldestDots.length;
        }
    
        res.status(201).send({
            success: true,
            totalDocuments: count,  // Current number of documents
            deletedDocuments: deletedCount  // Number of deleted documents
        });
    } catch (err) {
        res.status(500).send({ success: false, error: "Failed to save the orange dot" });
    }
});
