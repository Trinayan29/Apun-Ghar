export type RoomType = "Private room" | "Shared room" | "PG" | "Hostel" | "Flat";

export interface Property {
  id: string;
  name: string;
  locality: string;
  city: string;
  anchor: string; // college / workplace the distance is measured from
  distanceKm: number;
  commuteMins: number;
  commuteMode: string;
  roomType: RoomType;
  category: "PG" | "Hostel" | "Room" | "Flat";
  rent: number;
  maintenance: number;
  utilities: number;
  deposit: number;
  verified: boolean;
  gender: "Girls" | "Boys" | "Co-ed";
  furnished: "Furnished" | "Semi-furnished" | "Unfurnished";
  food: boolean;
  wifi: boolean;
  ac: boolean;
  parking: boolean;
  attachedBath: boolean;
  available: string;
  rating: number;
  reviews: number;
  images: string[];
  amenities: string[];
  rules: string[];
  about: string;
  owner: { name: string; since: string; responseRate: number; phone: string };
}

const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=60`;

export const COLLEGES = [
  "Assam Downtown University",
  "Assam Don Bosco University (ADTU)",
  "Gauhati University",
  "Assam Engineering College",
  "NEF College",
];

export const AREAS = [
  "Beltola",
  "Six Mile",
  "Khanapara",
  "Jalukbari",
  "Zoo Road",
  "Ganeshguri",
  "Dispur",
];

export const PROPERTIES: Property[] = [
  {
    id: "green-view-pg",
    name: "Green View PG",
    locality: "Beltola",
    city: "Guwahati",
    anchor: "ADTU",
    distanceKm: 1.4,
    commuteMins: 12,
    commuteMode: "bike",
    roomType: "Private room",
    category: "PG",
    rent: 8000,
    maintenance: 1000,
    utilities: 200,
    deposit: 16000,
    verified: true,
    gender: "Girls",
    furnished: "Furnished",
    food: true,
    wifi: true,
    ac: false,
    parking: true,
    attachedBath: true,
    available: "Available now",
    rating: 4.4,
    reviews: 86,
    images: [
      img("photo-1522708323590-d24dbb6b0267"),
      img("photo-1505691938895-1758d7feb511"),
      img("photo-1556912167-f556f1f39fdf"),
    ],
    amenities: ["Home-style food", "High-speed Wi-Fi", "Attached bathroom", "Parking", "Power backup", "CCTV"],
    rules: ["Gate closes at 10 PM", "No smoking", "Visitors till 7 PM"],
    about:
      "A quiet, well-kept girls PG on a residential lane in Beltola. Most residents are ADTU and Downtown University students. The warden lives on the ground floor and food is cooked fresh twice a day.",
    owner: { name: "Mitali Das", since: "2021", responseRate: 92, phone: "+91 98XXX X2104" },
  },
  {
    id: "boys-den-hostel",
    name: "Boys Den Hostel",
    locality: "Six Mile",
    city: "Guwahati",
    anchor: "ADTU",
    distanceKm: 0.8,
    commuteMins: 7,
    commuteMode: "walk",
    roomType: "Shared room",
    category: "Hostel",
    rent: 5500,
    maintenance: 800,
    utilities: 150,
    deposit: 6000,
    verified: true,
    gender: "Boys",
    furnished: "Furnished",
    food: true,
    wifi: true,
    ac: false,
    parking: false,
    attachedBath: false,
    available: "2 beds left",
    rating: 4.1,
    reviews: 132,
    images: [
      img("photo-1554995207-c18c203602cb"),
      img("photo-1484154218962-a197022b5858"),
      img("photo-1552321554-5fefe8c9ef14"),
    ],
    amenities: ["3 meals included", "Wi-Fi", "Study hall", "Laundry twice a week", "Warden on-site"],
    rules: ["No smoking or alcohol", "Gate closes at 10:30 PM", "Mess timings fixed"],
    about:
      "Budget-friendly boys hostel walking distance from the university gate. Popular with first-year students — mess food gets genuinely good reviews and the study hall stays open till midnight.",
    owner: { name: "Pranjal Bora", since: "2019", responseRate: 88, phone: "+91 97XXX X8831" },
  },
  {
    id: "sunrise-residency",
    name: "Sunrise Residency 2BHK",
    locality: "Khanapara",
    city: "Guwahati",
    anchor: "GNRC Office",
    distanceKm: 2.1,
    commuteMins: 15,
    commuteMode: "bike",
    roomType: "Flat",
    category: "Flat",
    rent: 14000,
    maintenance: 1500,
    utilities: 600,
    deposit: 28000,
    verified: true,
    gender: "Co-ed",
    furnished: "Semi-furnished",
    food: false,
    wifi: false,
    ac: false,
    parking: true,
    attachedBath: true,
    available: "From 1 Oct",
    rating: 4.6,
    reviews: 41,
    images: [
      img("photo-1560448204-e02f11c3d0e2"),
      img("photo-1493809842364-78817add7ffb"),
      img("photo-1556912167-f556f1f39fdf"),
    ],
    amenities: ["2BHK, 980 sq ft", "Modular kitchen", "Covered parking", "24x7 water", "Balcony"],
    rules: ["Family or working professionals preferred", "No subletting", "1 month notice"],
    about:
      "Sun-facing 2BHK on the 3rd floor with a wide balcony overlooking the Khanapara hills. Suits two working friends splitting rent — comes with wardrobes, geyser and a modular kitchen.",
    owner: { name: "Rituraj Kalita", since: "2020", responseRate: 95, phone: "+91 99XXX X4402" },
  },
  {
    id: "lakeview-girls-pg",
    name: "Lakeview Girls PG",
    locality: "Zoo Road",
    city: "Guwahati",
    anchor: "Gauhati University",
    distanceKm: 3.2,
    commuteMins: 18,
    commuteMode: "bus",
    roomType: "PG",
    category: "PG",
    rent: 7500,
    maintenance: 900,
    utilities: 200,
    deposit: 15000,
    verified: false,
    gender: "Girls",
    furnished: "Furnished",
    food: true,
    wifi: true,
    ac: true,
    parking: false,
    attachedBath: true,
    available: "Available now",
    rating: 3.9,
    reviews: 57,
    images: [
      img("photo-1595526114035-0d45ed16cfbf"),
      img("photo-1520250497591-112f2f40a3f4"),
      img("photo-1584622650111-993a426fbf0a"),
    ],
    amenities: ["AC rooms", "Food included", "Wi-Fi", "Attached bath", "Fridge on each floor"],
    rules: ["Gate closes at 9:30 PM", "No guests overnight"],
    about:
      "Newly renovated girls PG near Zoo Road tiniali with AC rooms and homely Assamese meals. Verification visit is scheduled — check back for the verified badge.",
    owner: { name: "Bornali Saikia", since: "2023", responseRate: 76, phone: "+91 98XXX X1190" },
  },
  {
    id: "scholar-stay",
    name: "Scholar Stay PG",
    locality: "Jalukbari",
    city: "Guwahati",
    anchor: "Assam Engineering College",
    distanceKm: 1.1,
    commuteMins: 9,
    commuteMode: "cycle",
    roomType: "Shared room",
    category: "PG",
    rent: 6000,
    maintenance: 700,
    utilities: 150,
    deposit: 12000,
    verified: true,
    gender: "Co-ed",
    furnished: "Furnished",
    food: true,
    wifi: true,
    ac: false,
    parking: true,
    attachedBath: false,
    available: "Available now",
    rating: 4.2,
    reviews: 94,
    images: [
      img("photo-1512918728675-ed5a9ecdebfd"),
      img("photo-1502672260266-1c1ef2d93688"),
      img("photo-1631679706909-1844bbd07221"),
    ],
    amenities: ["Food + Wi-Fi included", "Common study room", "Parking", "Hot water", "Weekly cleaning"],
    rules: ["Study hours 9 PM – 6 AM quiet", "No smoking"],
    about:
      "A favourite with AEC students — 10 minutes by cycle from campus. Twin-sharing rooms with individual study tables, and a mess menu that actually rotates through the week.",
    owner: { name: "Dhruba Nath", since: "2018", responseRate: 90, phone: "+91 97XXX X5527" },
  },
  {
    id: "ganeshguri-studio",
    name: "Ganeshguri Studio Room",
    locality: "Ganeshguri",
    city: "Guwahati",
    anchor: "Dispur Secretariat",
    distanceKm: 1.6,
    commuteMins: 11,
    commuteMode: "bike",
    roomType: "Private room",
    category: "Room",
    rent: 9500,
    maintenance: 500,
    utilities: 400,
    deposit: 19000,
    verified: true,
    gender: "Co-ed",
    furnished: "Furnished",
    food: false,
    wifi: true,
    ac: true,
    parking: false,
    attachedBath: true,
    available: "Available now",
    rating: 4.5,
    reviews: 38,
    images: [
      img("photo-1502672260266-1c1ef2d93688"),
      img("photo-1552321554-5fefe8c9ef14"),
      img("photo-1522708323590-d24dbb6b0267"),
    ],
    amenities: ["AC + Wi-Fi", "Attached bath + kitchenette", "Independent entry", "Fridge", "Geyser"],
    rules: ["Working professionals preferred", "No parties", "Electricity on sub-meter"],
    about:
      "Independent studio with its own entry and kitchenette — ideal if you want privacy without flat chores. Owner stays on a different floor and is known for quick maintenance.",
    owner: { name: "Kabita Sharma", since: "2022", responseRate: 97, phone: "+91 98XXX X6733" },
  },
  {
    id: "dispur-comfort-1bhk",
    name: "Dispur Comfort 1BHK",
    locality: "Dispur",
    city: "Guwahati",
    anchor: "Assam Secretariat",
    distanceKm: 0.9,
    commuteMins: 8,
    commuteMode: "walk",
    roomType: "Flat",
    category: "Flat",
    rent: 11000,
    maintenance: 1000,
    utilities: 500,
    deposit: 22000,
    verified: false,
    gender: "Co-ed",
    furnished: "Unfurnished",
    food: false,
    wifi: false,
    ac: false,
    parking: true,
    attachedBath: true,
    available: "From 15 Oct",
    rating: 4.0,
    reviews: 22,
    images: [
      img("photo-1493809842364-78817add7ffb"),
      img("photo-1484154218962-a197022b5858"),
      img("photo-1560448204-e02f11c3d0e2"),
    ],
    amenities: ["1BHK ground floor", "Parking", "24x7 water", "Small lawn", "Pet friendly"],
    rules: ["11-month agreement", "Pets allowed", "1 month notice"],
    about:
      "Ground-floor 1BHK with a small private lawn near the Secretariat — rare at this price. Unfurnished, so best if you already own basics or are splitting furnishing with a partner.",
    owner: { name: "Hemen Deka", since: "2024", responseRate: 68, phone: "+91 96XXX X2088" },
  },
  {
    id: "khanapara-twin-pg",
    name: "Khanapara Twin PG",
    locality: "Khanapara",
    city: "Guwahati",
    anchor: "NEF College",
    distanceKm: 1.9,
    commuteMins: 14,
    commuteMode: "bus",
    roomType: "Shared room",
    category: "PG",
    rent: 6800,
    maintenance: 700,
    utilities: 200,
    deposit: 13600,
    verified: true,
    gender: "Boys",
    furnished: "Semi-furnished",
    food: true,
    wifi: true,
    ac: false,
    parking: true,
    attachedBath: false,
    available: "3 beds left",
    rating: 4.3,
    reviews: 73,
    images: [
      img("photo-1631679706909-1844bbd07221"),
      img("photo-1554995207-c18c203602cb"),
      img("photo-1505691938895-1758d7feb511"),
    ],
    amenities: ["Food + Wi-Fi", "Twin sharing", "Parking", "Gym corner", "Power backup"],
    rules: ["No smoking", "Visitors till 8 PM", "Fees by 5th"],
    about:
      "Sporty boys PG with a small gym corner and big dining hall. Walking distance to the Khanapara bus stop with direct buses to most colleges.",
    owner: { name: "Jitul Gogoi", since: "2020", responseRate: 91, phone: "+91 97XXX X3419" },
  },
];

export const totalMonthly = (p: Property) => p.rent + p.maintenance + p.utilities;
export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
