from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum

class CurrencyEnum(str, enum.Enum):
    USD = "USD"
    ZWL = "ZWL"

class BatchStatusEnum(str, enum.Enum):
    OPEN = "OPEN"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    PARTIAL = "PARTIAL"
    REJECTED = "REJECTED"

class BatchOrderStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    ADJUSTED = "ADJUSTED"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String, nullable=False)
    surname = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Vehicle(Base):
    __tablename__ = "vehicles"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    plate_number = Column(String, unique=True, nullable=True)
    driver_name = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    orders = relationship("Order", back_populates="vehicle")

class Client(Base):
    __tablename__ = "clients"
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    id_number = Column(String, unique=True, nullable=False, index=True)
    ec_number = Column(String, unique=True, nullable=False, index=True)
    employer = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    orders = relationship("Order", back_populates="client")

class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    reference_number = Column(String, nullable=True)
    amount = Column(Float, nullable=False)
    currency = Column(Enum(CurrencyEnum), nullable=False, default=CurrencyEnum.USD)
    term_months = Column(Integer, nullable=False)
    monthly_instalment = Column(Float, nullable=False)
    start_date = Column(String, nullable=True)
    end_date = Column(String, nullable=True)
    scanned_form_path = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    client = relationship("Client", back_populates="orders")
    vehicle = relationship("Vehicle", back_populates="orders")
    batch_orders = relationship("BatchOrder", back_populates="order")

class Batch(Base):
    __tablename__ = "batches"
    id = Column(Integer, primary_key=True, index=True)
    batch_number = Column(String, unique=True, nullable=False, index=True)
    status = Column(Enum(BatchStatusEnum), nullable=False, default=BatchStatusEnum.OPEN)
    notes = Column(Text, nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    batch_orders = relationship("BatchOrder", back_populates="batch")

class BatchOrder(Base):
    __tablename__ = "batch_orders"
    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=False)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    status = Column(Enum(BatchOrderStatusEnum), nullable=False, default=BatchOrderStatusEnum.PENDING)
    rejection_reason = Column(String, nullable=True)
    adjusted_term_months = Column(Integer, nullable=True)
    adjusted_instalment = Column(Float, nullable=True)
    batch = relationship("Batch", back_populates="batch_orders")
    order = relationship("Order", back_populates="batch_orders")