// *** info ***
// 기존의 track_server_new.js코드의 포트 4003(외부포트:24003)과 통합하여 특정날짜 입력하면 그 경로를 띄울 수 있다.
// psql의 water_quality테이블의 gps데이터컬럼을 timestamp의 시간순서대로 불러와서 대시보드에서 특정날짜를 입력하면 그 날짜에 다녀왔던 경로를 쫙 띄우게끔

// *** 파이프라인 ***
// - 기존의 경로html(소비자용)에서 기능을 추가한다. 파일명 : oneday_course.html
// 1. psql의 andong_1데이터베이스에서 water_quality라는 테이블의 timestamp,latitude,longitude컬럼데이터를 가져온다.
// 2. 대시보드상에서 2023년 10워 31일 이렇게 날짜를 선택하면 해당 timestamp의 순서대로 latitude,longitude 를 토대로 한 주황색 선 경로를 나타낸다.



const express = require('express');
const mongoose = require('mongoose');
const { Pool } = require('pg');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = 4003;  // 서버 코드 1의 포트,  // 외부포트 24003으로 포트포워딩해놓음
const gpsdatas_interval = 2000; // gpsdatas에 1초당 1개씩 모든로봇gps저장 (최대 100개 )
const gps20datas_interval = 60000; // 60000밀리초 = 1분마다 1개씩 gps20datas에 모든로봇 gps데이터 저장 (로봇마다 최대 20개씩)

// DB 설정을 위한 매개변수
const MONGO_DATABASE = "mapCourseDB";
const POSTGRES_DATABASE = "andong_1";
const POSTGRES_COLLECTION = "water_quality";

// 특정 도메인에서의 요청만 허용
const corsOptions = {
    origin: 'http://125.136.64.124:23000', // 요청을 허용할 도메인 설정
    credentials: true, // 쿠키를 허용
  };
  
app.use(cors(corsOptions));

const server = http.createServer(app);
const ws = new WebSocket('ws://125.136.64.124:24101'); // 24101에 전체로봇의 gps데이터가 들어오고있다.

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

// MongoDB 연결
const USERNAME = 'eco0';
const PASSWORD = '820429ape';
const DB_URI = `mongodb://${USERNAME}:${PASSWORD}@localhost:27017/${MONGO_DATABASE}?authSource=admin`;

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
// html에서 각 로봇의 동적 매개변수인 ROBOT_ID만 바꿔주면 동적으로 API endpoint 호출
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


// 두번째서버 : PostgreSQL 데이터베이스 연결 (서버 코드 2에서 가져옴)
// PostgreSQL 데이터베이스 연결
const pool = new Pool({
    user: 'eco0',
    host: 'localhost',
    database: POSTGRES_DATABASE,
    password: '820429ape',
    port: 5432,
});
  
//   // CORS 설정 (서버 코드 2에서 가져옴)
//   app.use(cors({
//     origin: 'http://125.136.64.124:23000',
//     credentials: true
//   }));
  
  // PostgreSQL 데이터베이스를 사용하는 라우트 추가 (서버 코드 2에서 가져옴)
  app.get('/get-water-quality', async (req, res) => {
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
        // latitude와 longitude가 모두 숫자인지 확인
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
  // psql로부터 gps데이터가 잘 들어오고있는지 확인하려면 아래주소들어가면댐
  // http://125.136.64.124:24003/get-water-quality?date=2023-10-31