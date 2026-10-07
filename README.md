# HVAC SafeGuard

A modern, production-grade full-stack web application for live IoT environmental monitoring and relay automation.

## Tech Stack
- **Frontend:** React (Vite), Tailwind CSS, Recharts, Lucide Icons
- **Backend:** Node.js, Express, Socket.io
- **Database:** PostgreSQL

## Setup Instructions

### 1. Database Setup (PostgreSQL)
1. Ensure PostgreSQL is installed and running on your system.
2. Create a new database named \`hvac_safeguard\`:
   \`\`\`sql
   CREATE DATABASE hvac_safeguard;
   \`\`\`
3. The backend applies \`backend/db/schema.sql\` at startup, including safe additive updates for device support. You can also run the schema script manually:
   \`\`\`bash
   psql -U postgres -d hvac_safeguard -f backend/db/schema.sql
   \`\`\`

### 2. Backend Setup
1. Navigate to the \`backend\` directory:
   \`\`\`bash
   cd backend
   \`\`\`
2. (Optional) Edit the \`.env\` file if your PostgreSQL credentials differ from the defaults (user: \`postgres\`, password: \`postgres\`).
3. Start the server:
   \`\`\`bash
   npm start
   \`\`\`
   *(Server runs on port 5000 and begins generating mock IoT sensor data every 5 seconds).*

### 3. Frontend Setup
1. Open a new terminal and navigate to the \`frontend\` directory:
   \`\`\`bash
   cd frontend
   \`\`\`
2. Start the Vite development server:
   \`\`\`bash
   npm run dev
   \`\`\`
3. Open \`http://localhost:5173\` in your browser.

## Features
- **Authentication:** Secure JWT-based login/registration with bcrypt password hashing.
- **Live Dashboard:** Real-time metrics for Temperature, Humidity, and AQI.
- **Charts:** Interactive line charts plotting sensor trends dynamically.
- **Relay Automation:** Configure threshold limits for automatic cooling fan activation or override manually.
- **ESP32 telemetry:** Register ESP32 boards, fans, and filters; receive authenticated sensor readings and relay commands over HTTP.
- **Daily history:** Stored PostgreSQL readings, date filtering, AQI charts, and daily summaries.
- **Device health:** Online state expires after 30 seconds without an ESP32 heartbeat; attached fans and filters report their working state through their board.
- **HVAC assistant:** Uses app data locally. Add \`OPENAI_API_KEY\` to \`backend/.env\` to enable OpenAI generated answers (API usage may incur charges).

See [backend/ESP32_INTEGRATION.md](backend/ESP32_INTEGRATION.md) for the ESP32 telemetry and relay command format.
