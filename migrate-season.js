// migrate-season.js
// Run with: MONGODB_URI=... node migrate-season.js
// Bumps all season:1 records → season:2 across all collections

require('dotenv').config();
const mongoose = require('mongoose');
const { Team, Standing, CoreMember, Season } = require('./models');

async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const results = await Promise.all([
    Team.updateMany(       { season: 1 }, { $set: { season: 2 } }),
    Standing.updateMany(   { season: 1 }, { $set: { season: 2 } }),
    CoreMember.updateMany( { season: 1 }, { $set: { season: 2 } }),
    Season.updateMany(     { number: 1 }, { $set: { number: 2, label: 'Season 2' } }),
  ]);

  console.log('Teams updated:',       results[0].modifiedCount);
  console.log('Standings updated:',   results[1].modifiedCount);
  console.log('CoreMembers updated:', results[2].modifiedCount);
  console.log('Season updated:',      results[3].modifiedCount);
  console.log('✅ Migration complete');

  await mongoose.disconnect();
}

migrate().catch(e => { console.error(e); process.exit(1); });
