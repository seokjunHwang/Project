const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
const PORT = 4003; // 외부포트 24003으로 포트포워딩해놓음

// 코스 설정 : CORS 활성화하여 다른 도메인의 요청을 허용
app.use(cors());
// 서버 시작: 지정된 포트에서 서버를 실행
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
// MongoDB 데이터베이스 연결 설정
const USERNAME = '*********';
const PASSWORD = '*********';
const DB_URI = `mongodb://${USERNAME}:${PASSWORD}@localhost:27017/mapCourseDB?authSource=admin`;

// MongoDB 연결: useNewUrlParser와 useUnifiedTopology 옵션 사용
mongoose.connect(DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log("Connected to MongoDB");
}).catch(err => {
    console.error("MongoDB connection error:", err);
});

// ------ 스키마 정의 -------
// 코스 스키마 : 로봇의 이동경로를 저장할 데이터 형식설정 (= 로봇에게 보내는 메시지형식)
const courseSchema = new mongoose.Schema({
    trackId: { type: String, required: true, unique: true },
    category: { type: String, required: true }, // 카테고리 필드 추가
    locations: [{
        id: Number,
        lat: Number,
        lng: Number
    }],
});
// 위에서 정의한 스키마를 사용하여 콜렉션 생성
const Course = mongoose.model('Course', courseSchema);

// 트래킹맵 주황색마커(경로)를 저장할 스키마(형식설정)
const orangeDotSchema = new mongoose.Schema({
    lat: Number,
    lng: Number,
    createdAt: { type: Date, default: Date.now }  // 생성된 시간 (나중에 오래된 데이터를 삭제하기 위해)
});

// 위에서 정의한 스키마를 사용하여 경로 콜렉션생성
const OrangeDot = mongoose.model('OrangeDot', orangeDotSchema, 'course_20');


// ------ API 엔드포인트 정의 ------

app.use(express.json());

// 코스저장 -> 몽고디비에 새로운 코스데이터저장
app.post('/save-course', async (req, res) => {
    console.log("Received Request Body:", req.body); // 요청 본문 로깅
    try {
        const { trackId, category, locations } = req.body; // 카테고리 변수 추가
        const course = new Course({ trackId, category, locations }); // 카테고리 변수 포함하여 코스 생성
        await course.save();
        res.status(201).send({ message: "Course saved successfully!" });
    } catch (err) {
        // 에러 출력
        console.error("Error while saving to MongoDB:", err);
        res.status(500).send({ error: "Failed to save the course" });
        
    }
});

// 전체 코스가져오기 from 몽고디비
app.get('/get-courses', async (req, res) => {
    try {
        const courses = await Course.find({}, 'trackId category');  // 카테고리 정보도 함께 반환
        res.status(200).send(courses);
    } catch (err) {
        res.status(500).send({ error: "Failed to retrieve courses" });
    }
});


// 특정코스 마커 불러오기 from 몽고디비
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

// 코스정보 로봇에 보내기 ( 몽고 -> 로봇 )
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


// 코스 삭제
app.get('/delete-course', async (req, res) => {
    try {
        const { trackId } = req.query;
        
        // 해당 trackId를 가진 course를 찾아서 삭제
        const result = await Course.deleteOne({ trackId });

        // 만약 삭제된 문서가 없다면, 즉 해당 trackId를 가진 course가 없다면
        if (result.deletedCount === 0) {
            return res.status(404).send({ error: "Course not found" });
        }

        // 성공적으로 삭제되었으면 성공 메시지를 반환
        res.status(200).send({ message: "Successfully deleted course" });

    } catch (err) {
        // 에러 발생 시 500 에러 반환
        res.status(500).send({ error: "Failed to delete course" });
    }
});

// 주황색마커(경로위치가 찍히는점) 몽고디비에 저장
app.post('/save-orange-dot', async (req, res) => {
    try {
        const { lat, lng } = req.body;

        const newOrangeDot = new OrangeDot({ lat, lng });
        await newOrangeDot.save();

        // 10개를 초과하는 데이터가 있는지 확인
        const count = await OrangeDot.countDocuments();
        console.log(`Orange dot saved. Total count: ${count}`);  // 여기에 로그 추가!

        let deletedCount = 0;  // 삭제된 데이터의 개수

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
            totalDocuments: count,  // 현재 문서의 개수
            deletedDocuments: deletedCount  // 삭제된 문서의 개수
        });
    } catch (err) {
        res.status(500).send({ success: false, error: "Failed to save the orange dot" });
    }
});
