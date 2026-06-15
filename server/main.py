from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from dotenv import load_dotenv
from routes import auth, orders, batches, dashboard
import models
from routes import auth, orders, batches, dashboard, repunches



load_dotenv()

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Sun n Shield API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(orders.router)
app.include_router(batches.router)
app.include_router(dashboard.router)
app.include_router(repunches.router)

@app.get("/")
def root():
    return {"message": "Sun n Shield API is running"}