/**
 * One-time migration script — creates all collections, indexes, and admin seed
 * on the new MongoDB cluster. Does NOT copy any records from the old DB.
 *
 * Run:  node migrate-new-db.js
 */

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const NEW_DB_URI = 'mongodb+srv://labelstar48_db_user:5bIMR8d2lnA2kzVh@cluster0.nmdxdlc.mongodb.net/shipmehub';

// ─── Schema definitions (mirrored from server/models/) ───────────────────────

const userSchema = new mongoose.Schema({
  firstName:            { type: String, required: true, trim: true, maxlength: 50 },
  lastName:             { type: String, required: true, trim: true, maxlength: 50 },
  email:                { type: String, required: true, unique: true, lowercase: true, trim: true,
                          match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email'] },
  password:             { type: String, required: true, minlength: 12, select: false },
  role:                 { type: String, enum: ['admin', 'reseller', 'user'], default: 'user' },
  isActive:             { type: Boolean, default: true },
  lastLogin:            { type: Date },
  resetPasswordToken:   String,
  resetPasswordExpire:  Date,
  clients:              [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  managedUsers:         [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  source:               { type: String, enum: ['Organic', 'Paid Ads', null], default: null },
  emailNotifications:   { type: Boolean, default: true },
  creditLimit:          { type: Number, default: 0, min: 0 },
  creditUsed:           { type: Number, default: 0, min: 0 },
}, { timestamps: true });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});
const User = mongoose.model('User', userSchema);

// ─────────────────────────────────────────────────────────────────────────────

const balanceSchema = new mongoose.Schema({
  user:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  currentBalance:  { type: Number, default: 0, min: 0 },
  transactions: [{
    type:        { type: String, enum: ['topup', 'deduction', 'refund', 'adjustment'], required: true },
    amount:      { type: Number, required: true },
    description: { type: String, required: true },
    relatedFile: { type: mongoose.Schema.Types.ObjectId, ref: 'File', default: null },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt:   { type: Date, default: Date.now },
  }],
  lastUpdated: { type: Date, default: Date.now },
}, { timestamps: true });
balanceSchema.index({ user: 1 });
balanceSchema.index({ 'transactions.createdAt': -1 });
const Balance = mongoose.model('Balance', balanceSchema);

// ─────────────────────────────────────────────────────────────────────────────

const rateSchema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  labelRate:     { type: Number, required: true, min: 0 },
  currency:      { type: String, default: 'USD', enum: ['USD', 'EUR', 'GBP', 'CAD'] },
  setBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isActive:      { type: Boolean, default: true },
  notes:         { type: String, maxlength: 500 },
  effectiveFrom: { type: Date, default: Date.now },
  effectiveTo:   { type: Date, default: null },
}, { timestamps: true });
rateSchema.index({ user: 1, isActive: 1 });
rateSchema.index({ effectiveFrom: -1 });
const Rate = mongoose.model('Rate', rateSchema);

// ─────────────────────────────────────────────────────────────────────────────

const vendorSchema = new mongoose.Schema({
  name:                 { type: String, required: true, trim: true },
  carrier:              { type: String, enum: ['USPS', 'UPS', 'FedEx', 'DHL'], required: true },
  shippershubCarrierId: { type: String, default: null },
  shippershubVendorId:  { type: String, default: null },
  shippingService:      { type: String, default: '' },
  rate:                 { type: Number, required: true, min: 0, default: 0 },
  rateMin:              { type: Number, default: null },
  rateMax:              { type: Number, default: null },
  visibleToRoles:       { type: [String], enum: ['admin', 'reseller', 'user'], default: ['admin', 'reseller', 'user'] },
  visibleToUsers:       [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isActive:             { type: Boolean, default: true },
  description:          { type: String, default: '' },
  source:               { type: String, enum: ['shippershub', 'manual', 'labelcrow', 'shiplabel'], default: 'shippershub' },
  labelcrowSeriesId:    { type: Number, default: null },
  labelcrowProviderKey: { type: String, default: null },
  labelcrowServiceClass:{ type: String, default: null },
  shiplabelServiceId:   { type: String, default: null },
  shiplabelLabelSeries: { type: String, default: null },
  shiplabelLabelFormat: { type: String, default: null },
  vendorType:           { type: String, enum: ['api', 'manifest'], default: 'api' },
  vendorPortalEmail:    { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  vendorPortalPassword: { type: String, select: false },
  vendorPortalIsActive: { type: Boolean, default: false },
  vendorContactEmail:   { type: String, default: '' },
  vendorRate:           { type: Number, default: 0, min: 0 },
  dueBalance:           { type: Number, default: 0 },
  totalEarnings:        { type: Number, default: 0 },
}, { timestamps: true });
vendorSchema.pre('save', async function () {
  if (!this.isModified('vendorPortalPassword') || !this.vendorPortalPassword) return;
  const salt = await bcrypt.genSalt(12);
  this.vendorPortalPassword = await bcrypt.hash(this.vendorPortalPassword, salt);
});
const Vendor = mongoose.model('Vendor', vendorSchema);

// ─────────────────────────────────────────────────────────────────────────────

const labelSchema = new mongoose.Schema({
  user:               { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  vendor:             { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
  carrier:            { type: String, default: '' },
  vendorName:         { type: String, default: '' },
  shippingService:    { type: String, default: '' },
  shippershubLabelId: { type: String, default: null },
  trackingId:         { type: String, default: '' },
  labelcrowJobId:     { type: String, default: null },
  labelcrowOrderId:   { type: String, default: null },
  shiplabelOrderId:   { type: String, default: null },
  from_name:    { type: String, default: '' }, from_company: { type: String, default: '' },
  from_phone:   { type: String, default: '' }, from_address1:{ type: String, default: '' },
  from_address2:{ type: String, default: '' }, from_city:    { type: String, default: '' },
  from_state:   { type: String, default: '' }, from_zip:     { type: String, default: '' },
  from_country: { type: String, default: 'USA' },
  to_name:    { type: String, default: '' }, to_company: { type: String, default: '' },
  to_phone:   { type: String, default: '' }, to_address1:{ type: String, default: '' },
  to_address2:{ type: String, default: '' }, to_city:    { type: String, default: '' },
  to_state:   { type: String, default: '' }, to_zip:     { type: String, default: '' },
  to_country: { type: String, default: 'USA' },
  weight: { type: Number, default: 0 }, length: { type: Number, default: 0 },
  width:  { type: Number, default: 0 }, height: { type: Number, default: 0 },
  note:   { type: String, default: '' },
  price:  { type: Number, default: 0 },
  pdfUrl: { type: String, default: null }, awsKey: { type: String, default: null },
  awsPath:{ type: String, default: null },
  isBulk:       { type: Boolean, default: false },
  bulkJobId:    { type: String, default: null },
  bulkFileName: { type: String, default: '' },
  bulkZipUrl:   { type: String, default: null },
  status:         { type: String, enum: ['generated','failed','cancelled','pending'], default: 'generated' },
  trackingStatus: { type: String,
    enum: ['not_scanned_yet','in_transit','out_for_delivery','delivered','exception_problem','returned_to_sender','pending_pickup','delayed'],
    default: 'not_scanned_yet' },
  trackingStatusHistory: [{
    status:    { type: String, required: true },
    note:      { type: String, default: '' },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  }],
}, { timestamps: true });
labelSchema.index({ user: 1, createdAt: -1 });
labelSchema.index({ trackingId: 1 });
const Label = mongoose.model('Label', labelSchema);

// ─────────────────────────────────────────────────────────────────────────────

const walletSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true, unique: true },
  description: { type: String, default: '', trim: true },
  isActive:    { type: Boolean, default: true },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
const Wallet = mongoose.model('Wallet', walletSchema);

// ─────────────────────────────────────────────────────────────────────────────

const announcementSchema = new mongoose.Schema({
  title:    { type: String, required: true, trim: true },
  content:  { type: String, required: true, trim: true },
  category: { type: String, enum: ['general','service','pricing','maintenance'], default: 'general' },
  isPinned: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  createdBy:{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });
const Announcement = mongoose.model('Announcement', announcementSchema);

// ─────────────────────────────────────────────────────────────────────────────

const cashBookEntrySchema = new mongoose.Schema({
  type:         { type: String, enum: ['debit', 'credit'], required: true },
  amount:       { type: Number, required: true },
  wallet:       { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', default: null },
  expenseCategory:{ type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseCategory', default: null },
  description:  { type: String, default: '' },
  date:         { type: Date, required: true, default: Date.now },
  recordedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isVoided:     { type: Boolean, default: false },
  voidedAt:     { type: Date, default: null },
}, { timestamps: true });
cashBookEntrySchema.index({ date: -1 });
const CashBookEntry = mongoose.model('CashBookEntry', cashBookEntrySchema);

// ─────────────────────────────────────────────────────────────────────────────

const clientFinanceStatusSchema = new mongoose.Schema({
  client:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  carrier: { type: String, enum: ['USPS','UPS','FedEx','DHL'], required: true },
  month:   { type: Number, required: true },
  year:    { type: Number, required: true },
  status:  { type: String, enum: ['Clear','Pending','Outstanding','Blocked'], default: 'Pending' },
  notes:   { type: String, default: '' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
clientFinanceStatusSchema.index({ client: 1, carrier: 1, month: 1, year: 1 }, { unique: true });
clientFinanceStatusSchema.index({ month: 1, year: 1 });
const ClientFinanceStatus = mongoose.model('ClientFinanceStatus', clientFinanceStatusSchema);

// ─────────────────────────────────────────────────────────────────────────────

const equityPartnerSchema = new mongoose.Schema({
  name:      { type: String, required: true, unique: true },
  share:     { type: Number, required: true },
  isActive:  { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });
const EquityPartner = mongoose.model('EquityPartner', equityPartnerSchema);

// ─────────────────────────────────────────────────────────────────────────────

const expenseCategorySchema = new mongoose.Schema({
  name:      { type: String, required: true, unique: true },
  type:      { type: String, enum: ['expense','advertising','salary','distribution','transfer','other'], default: 'expense' },
  isActive:  { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });
const ExpenseCategory = mongoose.model('ExpenseCategory', expenseCategorySchema);

// ─────────────────────────────────────────────────────────────────────────────

const leaderboardEntrySchema = new mongoose.Schema({
  vendorName:      { type: String, required: true, trim: true },
  source:          { type: String, enum: ['shippershub','labelcrow','shiplabel'], required: true },
  carrier:         { type: String, default: 'USPS' },
  shippingService: { type: String, default: '' },
  successRate:     { type: Number, min: 0, max: 100, required: true },
  totalLabels:     { type: Number, default: 0, min: 0 },
  isVisible:       { type: Boolean, default: true },
  vendor:          { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
}, { timestamps: true });
const LeaderboardEntry = mongoose.model('LeaderboardEntry', leaderboardEntrySchema);

// ─────────────────────────────────────────────────────────────────────────────

const billingBreakdownSchema = new mongoose.Schema({
  service:  { type: String, default: '' },
  count:    { type: Number, default: 0 },
  rate:     { type: Number, default: 0 },
  subtotal: { type: Number, default: 0 },
});
const timelineEventSchema = new mongoose.Schema({
  action:      { type: String, required: true },
  note:        { type: String, default: '' },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  byVendor:    { type: Boolean, default: false },
  timestamp:   { type: Date, default: Date.now },
});
const manifestJobSchema = new mongoose.Schema({
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  carrier:        { type: String, enum: ['USPS','UPS','FedEx','DHL'], required: true },
  vendor:         { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
  assignedVendor: { type: mongoose.Schema.Types.ObjectId, ref: 'ManifestVendor', default: null },
  status:         { type: String, enum: ['open','assigned','accepted','uploaded','under_review','completed','cancelled','rejected'], default: 'open' },
  clientBilling: {
    labelCount:  { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    deducted:    { type: Boolean, default: false },
    breakdown:   [billingBreakdownSchema],
  },
  vendorPayment: {
    ratePerLabel: { type: Number, default: 0 },
    labelCount:   { type: Number, default: 0 },
    totalAmount:  { type: Number, default: 0 },
    credited:     { type: Boolean, default: false },
  },
  cancelledBy: { type: String, enum: ['admin','vendor','user', null], default: null },
  timeline:    [timelineEventSchema],
}, { timestamps: true });
manifestJobSchema.index({ user: 1, status: 1 });
manifestJobSchema.index({ assignedVendor: 1, status: 1 });
manifestJobSchema.index({ carrier: 1, status: 1, createdAt: -1 });
const ManifestJob = mongoose.model('ManifestJob', manifestJobSchema);

// ─────────────────────────────────────────────────────────────────────────────

const payoutSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  note:   { type: String, default: '' },
  paidAt: { type: Date, default: Date.now },
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
});
const manifestVendorSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:     { type: String, required: true, select: false },
  notifyEmail:  { type: String, default: '' },
  carriers:     { type: [{ type: String, enum: ['USPS','UPS','FedEx','DHL'] }], default: [] },
  vendorRate:   { type: Number, default: 0, min: 0 },
  stats: {
    totalJobs:     { type: Number, default: 0 },
    onTimeUploads: { type: Number, default: 0 },
    lateUploads:   { type: Number, default: 0 },
    completedJobs: { type: Number, default: 0 },
    rejectedJobs:  { type: Number, default: 0 },
    totalLabels:   { type: Number, default: 0 },
  },
  scoreOverride:  { type: Number, default: null, min: 1, max: 5 },
  payableBalance: { type: Number, default: 0 },
  totalPaidOut:   { type: Number, default: 0 },
  payouts:        [payoutSchema],
  isActive:       { type: Boolean, default: true },
  lastLogin:      { type: Date, default: null },
  description:    { type: String, default: '' },
}, { timestamps: true });
manifestVendorSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});
const ManifestVendor = mongoose.model('ManifestVendor', manifestVendorSchema);

// ─────────────────────────────────────────────────────────────────────────────

const paymentLogSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount:      { type: Number, required: true },
  description: { type: String, required: true },
  date:        { type: Date, default: Date.now },
  note:        { type: String, default: '' },
  labels:      { type: [], default: [] },
  recordedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  relatedJob:  { type: mongoose.Schema.Types.ObjectId, ref: 'ManifestJob', default: null },
}, { timestamps: true });
const PaymentLog = mongoose.model('PaymentLog', paymentLogSchema);

// ─────────────────────────────────────────────────────────────────────────────

const shippersHubAccountSchema = new mongoose.Schema({
  name:           { type: String, required: true },
  email:          { type: String, required: true },
  encryptedPass:  { type: String, required: true },
  isActive:       { type: Boolean, default: false },
  lastUsed:       { type: Date, default: null },
  lastLoginStatus:{ type: String, enum: ['success','failed', null], default: null },
}, { timestamps: true });
shippersHubAccountSchema.index({ isActive: 1 });
const ShippersHubAccount = mongoose.model('ShippersHubAccount', shippersHubAccountSchema);

// ─────────────────────────────────────────────────────────────────────────────

const userCarrierAssignmentSchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  carrier:    { type: String, enum: ['USPS','UPS','FedEx','DHL'], required: true },
  vendor:     { type: mongoose.Schema.Types.ObjectId, ref: 'ManifestVendor', required: true },
  isActive:   { type: Boolean, default: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes:      { type: String, default: '' },
}, { timestamps: true });
userCarrierAssignmentSchema.index({ user: 1, carrier: 1 });
const UserCarrierAssignment = mongoose.model('UserCarrierAssignment', userCarrierAssignmentSchema);

// ─────────────────────────────────────────────────────────────────────────────

const rateTierSchema = new mongoose.Schema({
  minLbs: { type: Number, required: true, default: 0 },
  maxLbs: { type: Number, default: null },
  rate:   { type: Number, required: true, min: 0 },
});
const userVendorAccessSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  vendor:    { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  carrier:   { type: String, required: true },
  isAllowed: { type: Boolean, default: true },
  rateTiers: [rateTierSchema],
}, { timestamps: true });
userVendorAccessSchema.index({ user: 1, vendor: 1, carrier: 1 }, { unique: true });
const UserVendorAccess = mongoose.model('UserVendorAccess', userVendorAccessSchema);

// ─────────────────────────────────────────────────────────────────────────────

const vendorCostSchema = new mongoose.Schema({
  carrier:    { type: String, enum: ['USPS','UPS','FedEx','DHL'], required: true },
  vendorName: { type: String, required: true },
  month:      { type: Number, required: true },
  year:       { type: Number, required: true },
  totalCost:  { type: Number, required: true },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
vendorCostSchema.index({ carrier: 1, vendorName: 1, month: 1, year: 1 }, { unique: true });
const VendorCost = mongoose.model('VendorCost', vendorCostSchema);

// ─── All models ──────────────────────────────────────────────────────────────

const ALL_MODELS = [
  User, Balance, Rate, Vendor, Label, Wallet, Announcement,
  CashBookEntry, ClientFinanceStatus, EquityPartner, ExpenseCategory,
  LeaderboardEntry, ManifestJob, ManifestVendor, PaymentLog,
  ShippersHubAccount, UserCarrierAssignment, UserVendorAccess, VendorCost,
];

// ─── Admin seed data ─────────────────────────────────────────────────────────

const ADMIN = {
  firstName: 'Admin',
  lastName:  'User',
  email:     'admin@uspslabelportal.com',
  password:  'Admin@123456!',
  role:      'admin',
};

// ─── Main ────────────────────────────────────────────────────────────────────

async function migrate() {
  console.log('\n🔗 Connecting to new MongoDB cluster…');
  await mongoose.connect(NEW_DB_URI);
  console.log('✅ Connected\n');

  // 1. Create collections + sync indexes
  console.log('📦 Creating collections & syncing indexes…');
  for (const Model of ALL_MODELS) {
    await Model.createCollection();
    await Model.syncIndexes();
    console.log(`   ✅ ${Model.modelName}`);
  }

  // 2. Seed admin user
  console.log('\n👤 Seeding admin credentials…');
  const existing = await User.findOne({ role: 'admin' });
  if (existing) {
    console.log(`   ℹ️  Admin already exists (${existing.email}) — skipping`);
  } else {
    const admin = new User(ADMIN);
    await admin.save();

    await Balance.create({
      user: admin._id,
      currentBalance: 10000,
      transactions: [{
        type: 'topup',
        amount: 10000,
        description: 'Initial admin balance',
        performedBy: admin._id,
      }],
    });

    await Rate.create({
      user:      admin._id,
      labelRate: 0.50,
      setBy:     admin._id,
      notes:     'Admin default rate',
    });

    console.log('   ✅ Admin user created');
    console.log('   📧 Email:    admin@uspslabelportal.com');
    console.log('   🔑 Password: Admin@123456!');
    console.log('   ⚠️  Change the password after first login!');
  }

  console.log('\n🎉 Migration complete!');
  console.log(`   Database: shipmehub`);
  console.log(`   Collections: ${ALL_MODELS.length}`);
  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
