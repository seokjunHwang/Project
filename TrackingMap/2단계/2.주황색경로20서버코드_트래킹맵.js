// *** Info ***
// < 서버코드 > 
// 1. 웹소캣 24101에서 모든 로봇의 gps데이터를 실시간으로 받음.
// 2. 몽고db의 gpsdatas컬렉션에 2초마다 모든로봇 gps데이터 저장 (최대100개저장 : gps20데이터를 쌓기위해 형식적으로 저장) 
// 3. gps20datas에 1분마다 한번씩 1~8번까지 전체로봇gps데이터 저장 (경로표시를 위함)
// 4. html이 10초마다 한번씩 gps20datas의 데이터들을 호출하여 지도에 주황색으로 찍는다.

// < HTML >
// 파일명 : Tracking_map(Customer).html
// 1. 웹소캣에서 전체로봇gps가져옴 ( 24101 외부포트사용 ) : 현재위치 실시간으로 찍기위함
// 2. 서버스크립트와 연결(24003포트)하여 gps20datas컬렉션(mongo)의 각 로봇에 맞는 gps데이터들을 20개 불러옴
// 3. 로봇마다 트래킹맵 html의 ROBOT_ID,ecobot_ID만 변경하여 대시보드 트래킹맵 적용가능 

// *** 서버코드를 실행시켜놔야 몽고db와 연결되어, 경로가 대시보드에 뜬다. ***

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = 4003; // 외부포트 24003으로 포트포워딩해놓음
const gpsdatas_interval = 2000; // gpsdatas에 1초당 1개씩 모든로봇gps저장 (최대 100개 )
const gps20datas_interval = 60000; // 60000밀리초 = 1분마다 1개씩 gps20datas에 모든로봇 gps데이터 저장 (로봇마다 최대 20개씩)

app.use(cors());

const server = http.createServer(app);
const ws = new WebSocket('ws://************:24101'); // 24101에 전체로봇의 gps데이터가 들어오고있다.

ws.on('open', function open() {
    console.log('Connected to the WebSocket server.');
});


let lastSavedTimestamp = Date.now(); // 마지막 저장 시간을 기록하는 변수를 추가(저장시간 텀을두기위함)

ws.on('message', async (message) => {
    try {
        // 현재 시간과 마지막 저장 시간 사이의 차이를 확인
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

            lastSavedTimestamp = now; // 저장 시간을 업데이트

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

// 1분마다 1개씩 gps20datas에 gps데이타넣기
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
}, gps20datas_interval); // 60000 = 1분

ws.on('close', function close() {
    console.log('Disconnected from the WebSocket server.');
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

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

// 모든로봇의 GPS데이타를 gpsdatas컬렉션에 저장하기위한 스키마
const GPSdata = mongoose.model('GPSdata', gpsDataSchema);

// 1분마다 1개씩 총20개 저장하는 gps20data컬렉션 스키마
const gps20DataSchema = new mongoose.Schema({
    robotID: String,
    lat: Number,
    lng: Number,
    createdAt: { type: Date, default: Date.now }
});

// 1분마다 저장할 gps20 컬렉션을 위한 스키마
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

// 로봇ID를 호출하여 가장 최신gps데이터(현재위치)가져오기
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

// gps20datas 콜렉션에서 주어진 robotID에 해당하는 데이터를 가져옴
// 각 로봇의 html에서 동적 매개변수인 ROBOT_ID만 바꿔주면 동적으로 API endpoint 호출
app.get('/get-gps20data-for-robot/:robotID', async (req, res) => {
    const robotID = req.params.robotID;  // 경로 매개변수에서 robotID 가져옴

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