// Mock Delivery Agency API Simulator
// This simulates Yalidine or any delivery agency's API for testing COD orders

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();

app.use(express.json());
app.use(cors());

// In-memory database for parcels
const parcels = new Map();
let parcelIdCounter = 1000;

// Parcel statuses that match delivery agency flow
const STATUSES = {
  PENDING_PICKUP: "pending_pickup", // Waiting for agency to collect
  COLLECTED: "collected", // Agency has picked up the package
  IN_TRANSIT: "in_transit", // Package is being transported
  OUT_FOR_DELIVERY: "out_for_delivery", // Delivery agent is on the way
  DELIVERED: "delivered", // Customer received & paid
  FAILED_DELIVERY: "failed_delivery", // Customer refused or not available
  RETURNED: "returned", // Package returned to seller
  COMPLETED: "completed", // Payment settled with seller
  CANCELLED: "cancelled", // ADD THIS
};

// ====================
// API ENDPOINTS
// ====================

// 1. CREATE PARCEL (Your e-commerce calls this when order is confirmed)
app.post("/api/v1/parcels", (req, res) => {
  const {
    order_id,
    customer_name,
    customer_phone,
    customer_address,
    wilaya,
    commune,
    product_list,
    price,
    webhook_url, // Your backend webhook endpoint
  } = req.body;

  // Validate required fields
  if (
    !order_id ||
    !customer_name ||
    !customer_phone ||
    !customer_address ||
    !price
  ) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields",
    });
  }

  // Create parcel
  const tracking_number = `YDN${parcelIdCounter++}`;
  const parcel = {
    tracking_number,
    order_id,
    customer_name,
    customer_phone,
    customer_address,
    wilaya: wilaya || "Tlemcen",
    commune: commune || "Tlemcen",
    product_list: product_list || [],
    price,
    cod_amount: price, // Cash on Delivery amount
    status: STATUSES.PENDING_PICKUP,
    webhook_url,
    created_at: new Date().toISOString(),
    status_history: [
      {
        status: STATUSES.PENDING_PICKUP,
        timestamp: new Date().toISOString(),
        note: "Parcel created and awaiting pickup",
      },
    ],
  };

  parcels.set(tracking_number, parcel);

  res.status(201).json({
    success: true,
    message: "Parcel created successfully",
    data: {
      tracking_number,
      status: parcel.status,
      estimated_delivery: "2-3 business days",
    },
  });

  // Send initial webhook
  if (webhook_url) {
    sendWebhook(webhook_url, parcel);
  }
});

// 2. GET PARCEL STATUS (Track a parcel)
app.get("/api/v1/parcels/:tracking_number", (req, res) => {
  const { tracking_number } = req.params;
  const parcel = parcels.get(tracking_number);

  if (!parcel) {
    return res.status(404).json({
      success: false,
      message: "Parcel not found",
    });
  }

  res.json({
    success: true,
    data: {
      tracking_number: parcel.tracking_number,
      order_id: parcel.order_id,
      status: parcel.status,
      customer_name: parcel.customer_name,
      customer_address: parcel.customer_address,
      cod_amount: parcel.cod_amount,
      status_history: parcel.status_history,
    },
  });
});

// 3. UPDATE PARCEL STATUS (Simulates delivery agency's internal updates)
app.put("/api/v1/parcels/:tracking_number/status", (req, res) => {
  const { tracking_number } = req.params;
  const { status, note } = req.body;
  const parcel = parcels.get(tracking_number);

  if (!parcel) {
    return res.status(404).json({
      success: false,
      message: "Parcel not found",
    });
  }

  if (!Object.values(STATUSES).includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid status",
    });
  }

  // Update status
  parcel.status = status;
  parcel.status_history.push({
    status,
    timestamp: new Date().toISOString(),
    note: note || `Status updated to ${status}`,
  });

  if (status === STATUSES.DELIVERED) {
    parcel.delivered_at = new Date().toISOString();
  }

  parcels.set(tracking_number, parcel);

  res.json({
    success: true,
    message: "Status updated successfully",
    data: {
      tracking_number,
      status: parcel.status,
    },
  });

  // Send webhook notification
  if (parcel.webhook_url) {
    sendWebhook(parcel.webhook_url, parcel);
  }
});

// 4. GET ALL PARCELS (For admin/testing)
app.get("/api/v1/parcels", (req, res) => {
  const allParcels = Array.from(parcels.values());
  res.json({
    success: true,
    count: allParcels.length,
    data: allParcels,
  });
});

// 5. SIMULATE DELIVERY FLOW (Auto-progress a parcel through all states)
app.post("/api/v1/parcels/:tracking_number/simulate", (req, res) => {
  const { tracking_number } = req.params;
  const { speed } = req.body; // 'fast', 'normal', 'slow'
  const parcel = parcels.get(tracking_number);

  if (!parcel) {
    return res.status(404).json({
      success: false,
      message: "Parcel not found",
    });
  }

  // Define delays based on speed
  const delays = {
    fast: 2000, // 2 seconds between states
    normal: 5000, // 5 seconds
    slow: 10000, // 10 seconds
  };

  const delay = delays[speed] || delays.normal;

  // Simulate progression through states
  const statusFlow =
    req.body.scenario === "failed"
      ? [
          STATUSES.COLLECTED,
          STATUSES.IN_TRANSIT,
          STATUSES.OUT_FOR_DELIVERY,
          STATUSES.FAILED_DELIVERY,
          STATUSES.RETURNED,
        ]
      : [
          STATUSES.COLLECTED,
          STATUSES.IN_TRANSIT,
          STATUSES.OUT_FOR_DELIVERY,
          STATUSES.DELIVERED,
          STATUSES.COMPLETED,
        ];

  let currentIndex = 0;

  const interval = setInterval(() => {
    if (currentIndex >= statusFlow.length) {
      clearInterval(interval);
      return;
    }

    const newStatus = statusFlow[currentIndex];
    parcel.status = newStatus;
    parcel.status_history.push({
      status: newStatus,
      timestamp: new Date().toISOString(),
      note: `Auto-simulated: ${newStatus}`,
    });

    if (newStatus === STATUSES.DELIVERED) {
      parcel.delivered_at = new Date().toISOString();
    }

    parcels.set(tracking_number, parcel);

    // Send webhook
    if (parcel.webhook_url) {
      sendWebhook(parcel.webhook_url, parcel);
    }

    currentIndex++;
  }, delay);

  res.json({
    success: true,
    message: `Simulation started for ${tracking_number}`,
    data: {
      tracking_number,
      simulation_speed: speed,
      estimated_completion: `${(statusFlow.length * delay) / 1000} seconds`,
    },
  });
});

// ====================
// WEBHOOK SENDER
// ====================
async function sendWebhook(webhookUrl, parcel) {
  try {
    await axios.post(
      webhookUrl,
      {
        event: "parcel.status.updated",
        timestamp: new Date().toISOString(),
        data: {
          tracking_number: parcel.tracking_number,
          order_id: parcel.order_id,
          status: parcel.status,
          cod_amount: parcel.cod_amount,
          delivered_at: parcel.delivered_at || null,
          status_history: parcel.status_history,
        },
      },
      {
        timeout: 5000,
      }
    );
    console.log(
      `✅ Webhook sent to ${webhookUrl} for ${parcel.tracking_number}`
    );
  } catch (error) {
    console.error(
      `❌ Webhook failed for ${parcel.tracking_number}:`,
      error.message
    );
  }
}

// ====================
// START SERVER
// ====================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`
🚚 Mock Delivery Agency API is running on http://localhost:${PORT}

Available Endpoints:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
POST   /api/v1/parcels                    Create new parcel
GET    /api/v1/parcels                    Get all parcels
GET    /api/v1/parcels/:tracking_number   Get parcel status
PUT    /api/v1/parcels/:tracking_number/status   Update status
POST   /api/v1/parcels/:tracking_number/simulate Auto-simulate delivery

Example: Create a parcel
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
curl -X POST http://localhost:${PORT}/api/v1/parcels \\
  -H "Content-Type: application/json" \\
  -d '{
    "order_id": "ORD123",
    "customer_name": "Ahmed Benali",
    "customer_phone": "0555123456",
    "customer_address": "Rue de la Liberté, Tlemcen",
    "wilaya": "Tlemcen",
    "price": 2500,
    "webhook_url": "http://localhost:5000/api/v1/orders/delivery/webhook"
  }'

Example: Simulate delivery flow
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
curl -X POST http://localhost:${PORT}/api/v1/parcels/YDN1000/simulate \\
  -H "Content-Type: application/json" \\
  -d '{"speed": "fast"}'
  `);
});
