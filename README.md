# FBAlgo
## CS 445 Final Project
### 2025, Fall 

### Team: StackOverflowed
Nicholas DeNobrega, Jackson Searles, Samuel Buckler

## Getting Started
FBAlgo is a sourcing and product-analysis platform designed for Amazon resellers. The system includes both a React web application and a Chrome extension. Some main functionalities allow our user to compare Amazon product prices against other retail websites, identify profitable arbitrage opportunities, save deals to review later, browse categorized deal lists generated from backend data analysis, and manage saved items and view them in a personal dashboard. The web app allows users to create an account, sign in, and browse deals by category. The Chrome extension lets users check for cheaper alternatives while viewing an Amazon product page. Behind the scenes, our Node.js backend, FastAPI Python service, and MongoDB database work together to analyze price data and store user information securely

### Roadmap
A list of features, function or non-functional, you would like to add in the future if you had time, i.e. Phase 2 stuff
- AI assistant to help explain whether a deal is truly profitable
- OAuth-style login with email verifcation
- Automatic notifications when saved products change in price
- Improve product-matching algorithms
- Add export options (CSV, PDF) for saved products
  >>
  
## SRS
[SRS Document Link](https://docs.google.com/document/d/1moUz0GT-I6-C1hZ39zFzJqXj-zGXleBgm-gJsuuI3co/edit?tab=t.0)
  
### Prerequisites
* Node.js v18+: Required for React and the Node backend
* npm or yarn: To install React dependencies
* React 18+ (Installed automatically when you run npm install in the frontend folder)
* Python 3.10+: For the FastAPI service
* MongoDB: Either MongoDB Atlas or local MongoDB Community Edition
* Docker: For running all services (frontend, backend, python API)
* Chrome Browser: Needed to load and test the Chrome extension
* FastAPI + required Python dependencies (Uvicorn, etc)
* Nodejs Frameworks (Express.js, Mongoose)

### Testing
Our project is hosted on Railway, and can be accessed by navigating to the link [FBAlgo Railway](https://project-stackoverflowed-production.up.railway.app/)
### Installing
There are a few options to install our project, one through Railway (cloud hosting website we are using) one through using the Docker files, and one through just manually installing locally. The Railway approach only works if you are added as a "contributor" of the project through Railway. For this approach you would:
1. Install the Railway CLI by running command curl -fsSL https://railway.com/install.sh | sh
2.  Connect to the project by running the command railway link -p b48f52cf-a83c-4ab1-8b46-61b4f3ead11b
3. If project was not "found", run 'railway login' first

The second approach is using our Docker files. To do this you need to:
1. First make sure you have Docker installed
2. Clone the repository by running command:
```bash
      git clone https://github.com/bucs445fall2025/project-stackoverflowed.git
  ```
3. From the root of the project, run
```bash
      docker compose up --build
  ```
4. To stop the services from running, run:
```bash
      docker compose down
  ```
The third approach is to manually install it locally. To do this, follow these steps:
1. Clone the repository by running commands:
```bash
      git clone https://github.com/bucs445fall2025/project-stackoverflowed.git
  ```
2. Then install frontend dependencies by cd'ing into /project/app and running
```bash
      npm install
  ```
3. Then install backend dependencies by cd'ing into /project/api and running
```bash
      npm install
  ```
4. Then install and start Python FASTAPI service by running the following commands in /project/pyapi:
```bash
    pip install -r requirements.txt
    uvicorn main:app --reload
  ```
5. Then start the Node backend by cding into /project/api and running
```bash
    npm run dev
  ```
6. Then start the React frontend by cding into /project/app and running:
```bash
    npm start
  ```
To load and use the chrome extension, go to chrome://extensions/, enable developer mode, click "Load unpacked", and finally select the /chrome-extension folder from the project folder

## Built With
Frontend (Next.js + React)
- Next.js 13 – Framework for routing, server-side rendering, and production builds
- React 18 – Core UI library
- Axios – HTTP client for calling backend APIs
- React Router DOM – Client-side navigation within the app

Backend (Node.js / Express)
- Node.js 20 – Runtime environment
- Express.js – Main web server and routing framework
- Mongoose – MongoDB ORM for users and saved deal data
- bcryptjs – Password hashing
- jsonwebtoken (JWT) – User authentication
- Axios / Node-Fetch / Undici – Outbound HTTP requests
- dotenv – Environment variable management

Python Service (FastAPI)
- FastAPI – High-performance API for product matching and scraping logic
- Uvicorn – ASGI server
- Motor – Async MongoDB driver
- RapidFuzz – String matching / similarity scoring
- httpx – HTTP client for scraping or external requests

Database
- MongoDB – Stores users, saved products, and cached deal data

Chrome Extension
- Manifest v3 – Modern Chrome extension architecture
- JavaScript – Injected scripts and UI logic
- Backend API integration – Communicates with Node + Python services

## License

## Acknowledgments

