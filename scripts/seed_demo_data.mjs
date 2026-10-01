/**
 * EchoCRM Demo Data Seeder
 *
 * Seeds a fresh, realistic demo dataset for EchoCRM.
 *
 * HOW TO RUN:
 *   node scripts/seed_demo_data.mjs --email your@email.com --password yourpassword
 *
 * WHAT IT DOES:
 *   - Authenticates as the existing app user (respects RLS)
 *   - Checks for existing customers to avoid duplicates
 *   - Inserts 15 fictional customers
 *   - Inserts 18 realistic tasks
 *   - Inserts 16 call records (metadata only, no audio files)
 *   - Inserts call summaries for the calls
 *
 * WHAT IT DOES NOT DO:
 *   - Does not create Deals
 *   - Does not create fake audio or recording files
 *   - Does not use service_role key
 *   - Does not modify RLS or schema
 *   - Does not delete existing records
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Read .env manually (no dotenv dependency needed)
// ---------------------------------------------------------------------------
function readEnv() {
  const envPath = resolve(__dirname, '..', '.env');
  try {
    const content = readFileSync(envPath, 'utf8');
    const env = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/\r$/, '');
      env[key] = value;
    }
    return env;
  } catch {
    console.error('ERROR: Could not read .env file. Ensure it exists in the project root.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Parse CLI arguments: --email and --password
// ---------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  let email = null;
  let password = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) email = args[++i];
    if (args[i] === '--password' && args[i + 1]) password = args[++i];
  }
  return { email, password };
}

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------
const ok = (msg) => console.log(`  checkmark ${msg}`);
const skip = (msg) => console.log(`  -> ${msg}`);
const warn = (msg) => console.warn(`  WARN ${msg}`);
const fail = (msg) => { console.error(`  FAIL ${msg}`); };
const section = (title) => {
  console.log('');
  console.log(`--- ${title} ---`);
};

// ---------------------------------------------------------------------------
// Sept 2026 dates helper
// ---------------------------------------------------------------------------
function d(month, day, hour = 10, min = 0) {
  return new Date(2026, month - 1, day, hour, min, 0).toISOString();
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------
const DEMO_CUSTOMERS = [
  { name: 'Arjun Menon', email: 'arjun.menon@novatechsystems.io', phone: '+91 98400 11234', company: 'NovaTech Systems', tags: ['Technology', 'Enterprise', 'High-Value'] },
  { name: 'Meera Nair', email: 'meera.nair@greenleaffoods.co', phone: '+91 99400 22345', company: 'GreenLeaf Foods', tags: ['Food & Beverage', 'SMB'] },
  { name: 'Daniel Thomas', email: 'daniel.thomas@vertexlabs.dev', phone: '+91 97300 33456', company: 'Vertex Labs', tags: ['Software', 'Startup', 'SaaS'] },
  { name: 'Ananya Rao', email: 'ananya.rao@urbannest.in', phone: '+91 96200 44567', company: 'UrbanNest Realty', tags: ['Real Estate', 'Enterprise'] },
  { name: 'Rahul Mathew', email: 'rahul.mathew@crestlineconsulting.com', phone: '+91 95100 55678', company: 'Crestline Consulting', tags: ['Consulting', 'Mid-Market'] },
  { name: 'Kavya Iyer', email: 'kavya.iyer@brightgridenergy.in', phone: '+91 94200 66789', company: 'BrightGrid Energy', tags: ['Renewable Energy', 'Enterprise', 'High-Value'] },
  { name: 'Aditya Sharma', email: 'aditya.sharma@cloudforgesolutions.com', phone: '+91 93300 77890', company: 'CloudForge Solutions', tags: ['IT Services', 'Mid-Market'] },
  { name: 'Neha Joseph', email: 'neha.joseph@finedgeadvisory.co', phone: '+91 92400 88901', company: 'FinEdge Advisory', tags: ['Financial Services', 'Enterprise'] },
  { name: 'Rohan Kapoor', email: 'rohan.kapoor@pixelcraftstudio.in', phone: '+91 91500 99012', company: 'PixelCraft Studio', tags: ['Design & Media', 'SMB', 'Creative'] },
  { name: 'Sneha Varma', email: 'sneha.varma@healthbridge.io', phone: '+91 90600 10123', company: 'HealthBridge Technologies', tags: ['Healthcare Technology', 'Startup', 'High-Value'] },
  { name: 'Vivek Menon', email: 'vivek.menon@routeonelogistics.com', phone: '+91 89700 21234', company: 'RouteOne Logistics', tags: ['Logistics', 'Enterprise'] },
  { name: 'Diya Krishnan', email: 'diya.krishnan@learnsphere.edu', phone: '+91 88800 32345', company: 'LearnSphere EdTech', tags: ['Education Technology', 'SMB'] },
  { name: 'Sanjay Pillai', email: 'sanjay.pillai@peakventuresgroup.com', phone: '+91 87900 43456', company: 'Peak Ventures Group', tags: ['Venture Capital', 'Enterprise'] },
  { name: 'Priya Chandran', email: 'priya.chandran@auroradesignco.in', phone: '+91 86100 54567', company: 'Aurora Design Co.', tags: ['Design & Media', 'SMB'] },
  { name: 'Karthik Nambiar', email: 'karthik.nambiar@zenithcloudworks.io', phone: '+91 85200 65678', company: 'Zenith Cloudworks', tags: ['Cloud Infrastructure', 'Mid-Market', 'SaaS'] },
];

const DEMO_TASKS_TEMPLATE = [
  { ci: 0, description: 'Follow up on NovaTech enterprise licensing proposal', status: 'pending', due_date: d(9, 30) },
  { ci: 0, description: 'Schedule technical architecture review session with Arjun', status: 'pending', due_date: d(10, 5) },
  { ci: 1, description: 'Send revised pricing quote to GreenLeaf Foods', status: 'done', due_date: d(9, 15) },
  { ci: 1, description: 'Prepare onboarding documentation for Meera Nair', status: 'pending', due_date: d(10, 3) },
  { ci: 2, description: 'Schedule product demo call with Vertex Labs engineering team', status: 'pending', due_date: d(10, 1) },
  { ci: 3, description: 'Send UrbanNest property analytics dashboard walkthrough recording', status: 'done', due_date: d(9, 20) },
  { ci: 4, description: 'Follow up after discovery call with Crestline Consulting', status: 'done', due_date: d(9, 12) },
  { ci: 5, description: 'Prepare BrightGrid Energy pilot program proposal', status: 'pending', due_date: d(10, 8) },
  { ci: 5, description: 'Schedule executive review call with Kavya Iyer', status: 'pending', due_date: d(10, 15) },
  { ci: 6, description: 'Send CloudForge Solutions integration documentation', status: 'pending', due_date: d(9, 28) },
  { ci: 7, description: 'Review FinEdge Advisory compliance requirements document', status: 'done', due_date: d(9, 18) },
  { ci: 8, description: 'Send PixelCraft Studio creative brief template', status: 'pending', due_date: d(10, 2) },
  { ci: 9, description: 'Follow up on HealthBridge pilot subscription renewal', status: 'pending', due_date: d(9, 27) },
  { ci: 10, description: 'Prepare RouteOne Logistics API integration proposal', status: 'done', due_date: d(9, 10) },
  { ci: 11, description: 'Send LearnSphere EdTech pricing comparison document', status: 'pending', due_date: d(10, 6) },
  { ci: 12, description: 'Schedule introductory call with Peak Ventures Group', status: 'pending', due_date: d(10, 12) },
  { ci: 13, description: 'Send Aurora Design Co. portfolio review request', status: 'done', due_date: d(9, 22) },
  { ci: 14, description: 'Follow up on Zenith Cloudworks cloud migration scope', status: 'pending', due_date: d(10, 4) },
];

const DEMO_CALLS_TEMPLATE = [
  { ci: 0, started_at: d(9, 2, 11), duration_seconds: 2340 },
  { ci: 0, started_at: d(9, 15, 14), duration_seconds: 3600 },
  { ci: 1, started_at: d(9, 4, 10), duration_seconds: 1800 },
  { ci: 2, started_at: d(9, 8, 15), duration_seconds: 2700 },
  { ci: 3, started_at: d(9, 11, 9), duration_seconds: 1500 },
  { ci: 4, started_at: d(9, 5, 11), duration_seconds: 2100 },
  { ci: 4, started_at: d(9, 18, 16), duration_seconds: 1800 },
  { ci: 5, started_at: d(9, 3, 10), duration_seconds: 4200 },
  { ci: 6, started_at: d(9, 16, 14), duration_seconds: 3000 },
  { ci: 7, started_at: d(9, 9, 11), duration_seconds: 2400 },
  { ci: 8, started_at: d(9, 22, 15), duration_seconds: 1200 },
  { ci: 9, started_at: d(9, 12, 10), duration_seconds: 3600 },
  { ci: 10, started_at: d(9, 6, 9), duration_seconds: 2700 },
  { ci: 11, started_at: d(9, 24, 11), duration_seconds: 1800 },
  { ci: 13, started_at: d(9, 19, 14), duration_seconds: 1500 },
  { ci: 14, started_at: d(9, 26, 16), duration_seconds: 2100 },
];

const DEMO_SUMMARIES_TEXT = [
  'Arjun Menon from NovaTech Systems expressed strong interest in enterprise licensing. Key requirements include SSO integration, 200+ seat license, and a dedicated SLA. Next step: send formal proposal by end of week.',
  'Detailed technical architecture review with NovaTech team. Requirements include on-premise data residency and SOC 2 Type II compliance. Engineering team to review API documentation. Follow-up scheduled for October.',
  'Meera discussed Q4 inventory management needs. GreenLeaf is evaluating three vendors. Pricing competitiveness is key. Revised quote requested by September 15th.',
  'Daniel\'s engineering team was impressed with the integration capabilities. Vertex Labs wants a 30-day pilot starting October. Demo recording to be shared with the broader team.',
  'Ananya outlined UrbanNest\'s requirements for analytics dashboards on property listings. Interested in CRM and property pipeline integration. Dashboard walkthrough was well received.',
  'Rahul confirmed Crestline\'s consulting arm needs workflow automation. Timeline is Q4. Decision in hands of CTO. Follow-up to be scheduled after internal review.',
  'Rahul confirmed internal approval received. Moving to contract stage. Compliance documentation requested. Contract to be sent by September 25th.',
  'Kavya outlined BrightGrid\'s ambitious expansion to 5 new states in 2027. Platform needs to support multi-region data reporting and renewable energy asset tracking.',
  'Aditya confirmed CloudForge is evaluating for a migration project starting January 2027. Integration with existing AWS infrastructure is a key requirement to resolve.',
  'Neha reviewed compliance requirements for financial advisory data handling. SEBI and RBI regulation alignment is mandatory. Legal team to review the agreement.',
  'Rohan shared creative brief outline. PixelCraft needs project management and client approval workflows. Quick onboarding expected within 2 weeks of contract sign.',
  'Sneha walked through HealthBridge patient data anonymization requirements. DPDP Act compliance is mandatory. Pilot renewal discussion was positive.',
  'Vivek confirmed RouteOne needs last-mile delivery API integration. Volume is 50,000 orders per month. Proposal to include enterprise SLA and uptime guarantees.',
  'Diya confirmed LearnSphere wants a phased rollout for their LMS integration. Pilot for 500 students planned for November. Pricing document to be shared this week.',
  'Priya from Aurora Design Co. reviewed the creative project management dashboard. Interested in the client portal feature. Onboarding timeline to be confirmed.',
  'Karthik confirmed Zenith Cloudworks is ready to begin cloud migration scoping in October. AWS to GCP migration across 14 microservices. Estimated 6-month timeline.',
];

const DEMO_SENTIMENTS = [
  'positive', 'positive', 'neutral', 'positive', 'positive', 'neutral',
  'positive', 'positive', 'neutral', 'neutral', 'positive', 'positive',
  'positive', 'positive', 'neutral', 'positive',
];

// ---------------------------------------------------------------------------
// Main seeder
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n=================================================');
  console.log('  EchoCRM Demo Data Seeder');
  console.log('=================================================');

  const env = readEnv();
  const { email, password } = parseArgs();

  if (!email || !password) {
    console.error('\nERROR: Provide --email and --password to authenticate.');
    console.error('Usage: node scripts/seed_demo_data.mjs --email you@example.com --password yourpassword\n');
    process.exit(1);
  }

  const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Step 1: Authenticate
  section('Step 1: Authenticating');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError || !authData.user) {
    fail(`Authentication failed: ${authError?.message}`);
    process.exit(1);
  }
  const ownerId = authData.user.id;
  ok(`Authenticated as ${authData.user.email} (uid: ${ownerId})`);

  // Step 2: Check existing customers
  section('Step 2: Checking Existing Data');
  const { data: existingCustomers, error: fetchErr } = await supabase
    .from('customers').select('id, name, email').eq('owner_id', ownerId);

  if (fetchErr) {
    fail(`Failed to fetch existing customers: ${fetchErr.message}`);
    process.exit(1);
  }

  const existingNames = new Set((existingCustomers || []).map(c => c.name.toLowerCase().trim()));
  const existingEmails = new Set((existingCustomers || []).map(c => (c.email || '').toLowerCase().trim()));
  console.log(`  Found ${existingCustomers?.length || 0} existing customers.`);

  // Step 3: Insert Customers
  section('Step 3: Creating Customers');
  const createdCustomers = [];
  let customersCreated = 0;
  let customersSkipped = 0;

  for (const cust of DEMO_CUSTOMERS) {
    const nameKey = cust.name.toLowerCase().trim();
    const emailKey = (cust.email || '').toLowerCase().trim();

    if (existingNames.has(nameKey) || (emailKey && existingEmails.has(emailKey))) {
      skip(`Already exists: ${cust.name}`);
      customersSkipped++;
      const found = (existingCustomers || []).find(c =>
        c.name.toLowerCase().trim() === nameKey ||
        (c.email || '').toLowerCase().trim() === emailKey
      );
      createdCustomers.push(found ? { id: found.id, name: cust.name } : { id: null, name: cust.name });
      continue;
    }

    const { data, error } = await supabase.from('customers').insert({
      owner_id: ownerId,
      name: cust.name,
      email: cust.email,
      phone: cust.phone,
      company: cust.company,
      tags: cust.tags,
    }).select('id, name').single();

    if (error) {
      warn(`Failed to insert ${cust.name}: ${error.message}`);
      createdCustomers.push({ id: null, name: cust.name });
    } else {
      ok(`Created: ${data.name}`);
      createdCustomers.push(data);
      customersCreated++;
    }
  }
  console.log(`  Customers created: ${customersCreated}, skipped: ${customersSkipped}`);

  // Step 4: Tasks
  section('Step 4: Creating Tasks');
  const { data: existingTasks } = await supabase.from('tasks').select('description').eq('owner_id', ownerId);
  const existingTaskDescs = new Set((existingTasks || []).map(t => t.description.toLowerCase().trim()));
  let tasksCreated = 0;
  let tasksSkipped = 0;

  for (const tmpl of DEMO_TASKS_TEMPLATE) {
    const customer = createdCustomers[tmpl.ci];
    if (!customer?.id) { skip(`Task skipped — no customer ID for index ${tmpl.ci}`); continue; }

    const descKey = tmpl.description.toLowerCase().trim();
    if (existingTaskDescs.has(descKey)) { skip(`Task exists: ${tmpl.description.slice(0, 50)}`); tasksSkipped++; continue; }

    const { error } = await supabase.from('tasks').insert({
      owner_id: ownerId, customer_id: customer.id, description: tmpl.description,
      status: tmpl.status, due_date: tmpl.due_date,
    });

    if (error) { warn(`Failed task: ${error.message}`); }
    else { ok(`[${tmpl.status.padEnd(7)}] ${tmpl.description.slice(0, 60)}`); tasksCreated++; }
  }
  console.log(`  Tasks created: ${tasksCreated}, skipped: ${tasksSkipped}`);

  // Step 5: Calls
  section('Step 5: Creating Call Records');
  const { data: existingCalls } = await supabase.from('calls').select('started_at, customer_id').eq('owner_id', ownerId);
  const existingCallKeys = new Set((existingCalls || []).map(c => `${c.customer_id}|${c.started_at}`));

  let callsCreated = 0;
  let callsSkipped = 0;
  const callEntries = [];

  for (let i = 0; i < DEMO_CALLS_TEMPLATE.length; i++) {
    const tmpl = DEMO_CALLS_TEMPLATE[i];
    const customer = createdCustomers[tmpl.ci];
    if (!customer?.id) { callEntries.push(null); skip(`Call skipped — no customer for index ${tmpl.ci}`); continue; }

    const callKey = `${customer.id}|${tmpl.started_at}`;
    if (existingCallKeys.has(callKey)) {
      // Try to find existing call ID for summary creation
      const { data: existing } = await supabase.from('calls').select('id').eq('customer_id', customer.id).eq('started_at', tmpl.started_at).maybeSingle();
      callEntries.push(existing ? { callId: existing.id, summaryText: DEMO_SUMMARIES_TEXT[i], sentiment: DEMO_SENTIMENTS[i] } : null);
      skip(`Call already exists: ${customer.name} @ ${tmpl.started_at.slice(0, 10)}`); callsSkipped++; continue;
    }

    const { data: callData, error } = await supabase.from('calls').insert({
      owner_id: ownerId, customer_id: customer.id,
      started_at: tmpl.started_at, duration_seconds: tmpl.duration_seconds,
      status: 'done', raw_transcript: null, audio_url: null,
    }).select('id').single();

    if (error) { warn(`Failed call: ${error.message}`); callEntries.push(null); }
    else {
      ok(`${customer.name} — ${tmpl.started_at.slice(0, 10)} (${Math.round(tmpl.duration_seconds / 60)} min)`);
      callEntries.push({ callId: callData.id, summaryText: DEMO_SUMMARIES_TEXT[i], sentiment: DEMO_SENTIMENTS[i] });
      callsCreated++;
    }
  }
  console.log(`  Calls created: ${callsCreated}, skipped: ${callsSkipped}`);

  // Step 6: Call Summaries
  section('Step 6: Creating Call Summaries');
  let summariesCreated = 0;
  let summariesSkipped = 0;

  for (const entry of callEntries) {
    if (!entry?.callId) { summariesSkipped++; continue; }

    const { data: existingSummary } = await supabase.from('call_summaries').select('id').eq('call_id', entry.callId).maybeSingle();
    if (existingSummary) { skip(`Summary exists for call ${entry.callId}`); summariesSkipped++; continue; }

    const { error } = await supabase.from('call_summaries').insert({
      call_id: entry.callId, summary_text: entry.summaryText, sentiment: entry.sentiment,
    });

    if (error) { warn(`Failed summary: ${error.message}`); }
    else { ok(`${entry.summaryText.slice(0, 70)}...`); summariesCreated++; }
  }
  console.log(`  Summaries created: ${summariesCreated}, skipped: ${summariesSkipped}`);

  // Final report
  console.log('\n=================================================');
  console.log('  SEED COMPLETE');
  console.log('=================================================');
  console.log(`  Customers created:  ${customersCreated}`);
  console.log(`  Customers skipped:  ${customersSkipped}`);
  console.log(`  Tasks created:      ${tasksCreated}`);
  console.log(`  Tasks skipped:      ${tasksSkipped}`);
  console.log(`  Calls created:      ${callsCreated}`);
  console.log(`  Calls skipped:      ${callsSkipped}`);
  console.log(`  Summaries created:  ${summariesCreated}`);
  console.log(`  Recordings:         0 (intentionally not seeded)`);
  console.log(`  Deals:              0 (feature removed)`);
  console.log(`  Existing data:      unchanged`);
  console.log('=================================================');
  console.log('  Open EchoCRM to see the demo data.\n');
}

main().catch((err) => {
  console.error('\nUnexpected error:', err.message);
  process.exit(1);
});
