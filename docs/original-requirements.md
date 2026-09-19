# CEDAR WINDS TIMECLOCK PWA

Build a production-ready Progressive Web App from scratch for Cedar Winds Design\~Build.

This is an internal employee timeclock, labour tracking, project costing, project-manager approval, and accounting export application.

The primary design goal is:

**EXTREMELY SIMPLE FOR EMPLOYEES IN THE FIELD. POWERFUL FOR MANAGEMENT ON THE BACK END.**

Do not overcomplicate the field interface.

An employee wearing work gloves and standing beside a truck at 7:00 AM should be able to understand what to do immediately.

The application must be a mobile-first PWA installable on iPhone and Android, while management interfaces must also have excellent responsive desktop layouts.

---

# 1. RECOMMENDED STACK

Build as a modern TypeScript application suitable for deployment on Railway.

Preferred architecture:

- Next.js
- TypeScript
- React
- Tailwind CSS
- PostgreSQL
- Prisma ORM
- secure server-side authentication
- Zod validation
- PWA manifest
- service worker
- responsive mobile/desktop UI
- CSV import/export
- transactional email provider abstraction

Use PostgreSQL as the authoritative database.

The application and database will be hosted on Railway.

Use environment variables for all secrets and configuration.

Create:

- `.env.example`
- database migrations
- seed script
- README with exact local/deployment instructions
- automated tests for critical timeclock/business logic
- production-safe error handling

Do not require a separate native iOS/Android application.

---

# 2. BRAND

Company:

CEDAR WINDS DESIGN\~BUILD

The application should feel premium, clean, simple and professional.

Visual direction:

- white / warm neutral backgrounds
- charcoal/dark typography
- subtle natural wood-inspired accents
- Cedar Winds branding
- generous whitespace
- large touch targets
- minimal visual clutter
- extremely obvious primary actions
- green indicates an available/confirmed positive action
- red reserved for destructive/error states

Create centralized theme variables so branding can easily be adjusted later.

The Cedar Winds logo asset will be supplied separately.

Do not invent a replacement company logo.

If the actual logo asset is unavailable during development, create a clearly marked placeholder component that can be replaced by an image file without changing layouts.

---

# 3. PWA REQUIREMENTS

This must be a genuine installable Progressive Web App.

Implement:

- web app manifest
- app name: Cedar Winds Timeclock
- short name: Cedar Winds
- standalone display mode
- theme/background colours
- installable icons with placeholder assets documented for later replacement
- Apple touch icon support
- iOS-friendly metadata
- service worker
- appropriate caching strategy
- responsive standalone layout
- install instructions for iPhone and Android

Do NOT allow offline punches that could create ambiguous timestamps.

If internet connectivity is unavailable, the app may display cached interface assets but must clearly state:

**Internet connection required to record time.**

Clock-in, switch, arrival and clock-out events must only be considered successful after the server/database confirms them.

Never silently queue a time punch offline.

---

# 4. AUTHENTICATION

Every employee has an individual account.

Authentication:

- email
- password
- secure password hashing
- secure server-side sessions
- logout
- forgot/reset password flow
- Admin password reset capability

The installed PWA should remember the authenticated session securely so employees normally do not need to type their email/password every time they scan a QR code.

Do not store plaintext passwords.

Implement reasonable brute-force/rate-limit protection on authentication.

Users may possess multiple permissions/modes.

Examples:

Employee A:

- SHOP
- SITE

Employee B:

- SHOP
- SITE
- OFFICE

Employee C:

- PM
- SITE

Employee D:

- CONTROLLER
- OFFICE

Employee E:

- OWNER

Roles/modes are NOT mutually exclusive.

Admin controls which modes are available to each user.

---

# 5. QR ARCHITECTURE

Create secure unique QR targets for:

- SHOP
- each TRUCK

QR codes should contain URLs pointing to the application with a non-guessable QR identifier/token.

Example concept:

`/scan/{secure-token}`

Do not put sensitive employee or project information directly in the QR URL.

The backend determines:

- QR type
- shop/truck identity
- logged-in employee
- employee permissions
- employee's current clock state

Then displays the correct interface.

Provide an Admin interface for generating, viewing and printing QR codes.

Revoking/regenerating a QR token must be supported.

---

# 6. PERSISTENT LOGO / MY HOURS

The Cedar Winds logo must remain visible in the TOP LEFT of every authenticated application page.

It acts as a persistent button.

When clicked/tapped, open:

**MY HOURS**

Display:

TODAY

- actual scan/clock-in time if appropriate
- paid start time
- current jobsite
- current task/activity
- current segment duration
- total paid hours today

PREVIOUS WEEK

- total PM-approved hours
- Approved / Pending status

Allow the employee to expand the previous week's summary to see hours grouped by:

- jobsite
- travel
- shop/office where applicable

Employees can ONLY see their own information through this interface.

This button must be available regardless of the current workflow screen.

---

# 7. EARLIEST START TIME

Admin can configure an individual earliest paid start time for every employee.

Example:

Employee scans at 6:43 AM.
Employee earliest paid start = 7:00 AM.

Store BOTH:

- actual scan timestamp = 6:43 AM
- effective paid start timestamp = 7:00 AM

Never destroy the original timestamp.

If the employee scans after the earliest start time, use the actual scan time.

All modifications must maintain an audit trail.

Timezone must be configurable, defaulting initially to:

America/Toronto

Use timezone-aware server timestamps.

---

# 8. START OF DAY

Everyone who records employee time starts their working day using the SHOP QR.

After scan/authentication:

Display:

**GOOD MORNING, {FIRST NAME}**

Show only the work modes that Admin has assigned to that employee:

- SHOP
- SITE
- OFFICE
- additional future modes if supported

PM/OWNER management functions are handled separately.

If an employee has exactly ONE applicable clock-in work mode, skip the mode-selection screen and proceed directly to that workflow.

---

# 9. SHOP WORKFLOW

SHOP may represent general shop work OR work performed in the shop for a particular project.

Clock-in screen:

GOOD MORNING, {FIRST NAME}

Select Jobsite:

- populated from Admin-approved jobsites available to this employee

Select Task:

- populated from Admin-approved tasks available to this employee/jobsite

Notes:

- optional text

CLOCK IN

Jobsite and Task are mandatory.

CLOCK IN remains disabled until required selections exist.

When valid, button becomes green.

Upon successful server confirmation:

**You're clocked in. Have a great day!**

Create the appropriate time segment.

---

# 10. SHOP — ALREADY CLOCKED IN

When the employee scans again while clocked in, display current status and two large buttons:

SWITCH
CLOCK OUT

Show:

- current jobsite
- current task
- start time
- current duration

SWITCH:

Jobsite:

- existing jobsite selected
- Change option

Task:

- existing task selected
- Change option

Notes:

- optional

SWITCH button becomes green when valid.

When confirmed:

Close the existing time segment and create the new segment at exactly the same server timestamp.

There must be:

- no overlap
- no unintended gap

CLOCK OUT:

Close the active segment and working day.

Next SHOP QR scan begins a new Start of Day workflow.

---

# 11. SITE WORKFLOW — START

Employee begins at SHOP QR.

Select:

Jobsite:

- Admin-approved availability for that employee

CLOCK IN

Jobsite is required.

Upon confirmation:

Create a TRAVEL segment automatically.

Travel origin:
SHOP

Travel destination:
selected jobsite

Display:

**You're clocked in.**

**Please remember to scan the QR code in the truck when you arrive at the jobsite. This helps us accurately track project expenses — not track you. Have a great day!**

The system must NOT use GPS.

---

# 12. TRUCK QR — ARRIVAL

Each truck has a unique QR identity.

Example:

- Truck 01
- Truck 02
- Truck 03

When an employee who is currently travelling scans a Truck QR:

Display:

Jobsite:

- destination already selected
- Change option

Task:

- required
- Admin-approved tasks

Notes:

- optional

ARRIVED

ARRIVED is disabled until Task is selected, then becomes green.

Upon confirmation:

- close Travel segment
- create Site Work segment
- associate truck with the scan/event
- infer truck's current jobsite from this activity
- display success message

**Have a great day!**

No GPS tracking.

---

# 13. SITE — ACTIVE WORK

Subsequent appropriate Truck QR scan shows:

- current jobsite
- current task
- time started
- current duration

Buttons:

SWITCH
CLOCK OUT

SWITCH:

Jobsite:

- existing selection
- Change option

Task:

- existing selection
- Change option

Notes:

- optional

If only Task changes:

- close previous work segment
- immediately start new work segment

If Jobsite changes:

- close previous work segment
- automatically start a TRAVEL segment toward the new jobsite
- employee must subsequently scan a Truck QR and select ARRIVED before productive jobsite work starts

This behaviour is critical.

Do not allow travel between sites to accidentally remain recorded as productive task labour.

---

# 14. SITE CLOCK OUT

CLOCK OUT closes the employee's active segment and working day.

Store:

- time
- last jobsite
- last truck interaction where applicable
- relevant audit information

The next Shop QR scan begins a new working day.

---

# 15. OFFICE WORKFLOW

OFFICE requires:

Select Jobsite / Cost Centre:

- Admin-approved list

Notes:

- optional

CLOCK IN

Jobsite/Cost Centre is required.

No Task selection is required for OFFICE.

After clock-in, subsequent Shop QR scan shows:

SWITCH
CLOCK OUT

SWITCH allows:

- change Jobsite/Cost Centre
- optional notes

Close old segment and open new segment at the same timestamp.

Allow Admin to create overhead Cost Centres such as:

- Cedar Winds – General Administration
- Cedar Winds – Sales
- Cedar Winds – Estimating

as well as real projects.

---

# 16. PROJECT MANAGER MODE

PM users do NOT automatically clock time simply by opening PM mode.

PM dashboard:

LOCATE
VERIFY

Also provide an always-visible:

**OPEN ON DESKTOP**

button.

This emails the PM a secure expiring link to open the management interface in a desktop browser.

Do not email a permanent authentication bypass token.

Use a short-lived, single-purpose secure link and require normal authentication where appropriate.

---

# 17. PM — LOCATE

LOCATE is NOT GPS.

Display current operational state of all authorized SHOP and SITE employees.

Show:

- employee name
- current state
- jobsite
- task
- time current activity started
- truck where relevant

Possible states:

- SHOP
- TRAVEL
- SITE
- CLOCKED OUT

Also show Trucks:

- Truck name
- inferred location/status
- last relevant scan
- employee(s) associated with recent scan/activity

If there is no evidence that a truck left the Shop, default/infer Shop but clearly label inferred data.

Display:

**Locations are based on employee selections and QR scans. GPS is not used.**

PM visibility should be configurable to assigned projects/employees.

---

# 18. WEEKLY PM VERIFY

Create weekly approval workflow.

Time records progress through statuses such as:

- RECORDED
- PENDING\_PM\_APPROVAL
- PM\_APPROVED
- EXPORTED

PM sees previous completed week's employee records.

Group by employee, then date.

Show:

- date
- employee
- jobsite
- task
- start
- end
- duration
- travel indicator
- notes
- accounting code
- approval state

PM may edit before approval:

- employee where authorized
- jobsite
- task
- start time
- end time
- accounting code
- notes

Every edit MUST be audit logged:

- original value
- new value
- user making change
- timestamp
- optional/required correction reason as appropriate

Never silently overwrite original records.

PM can:

- approve individual line
- approve day
- approve employee week

Prevent approval of invalid/overlapping records.

---

# 19. ACCOUNTING CODES

Admin manages Accounting Codes.

Codes may be associated with:

- jobsites
- tasks
- jobsite + task combinations

When possible, automatically suggest the correct Accounting Code.

Example:

Ross + Framing -> suggested accounting code.

PM verifies or overrides.

Normal labour requires an Accounting Code before final approval.

Travel segments are automatically identified as TRAVEL and require a simple PM checkmark/approval.

Design this to minimize PM data entry.

---

# 20. CONTROLLER

CONTROLLER is an employee who clocks in.

Initial screen:

CLOCK IN

After clock-in:

LOCATE
INFO
SEND
CLOCK OUT

LOCATE:

Show current SHOP, OFFICE and SITE employees.

Show:

- current status
- jobsite
- task where applicable
- trucks and inferred locations

No GPS.

INFO:

Quick employee hour summary.

Filters:

- DAY
- WEEK
- MONTH
- YEAR
- EMPLOYEE

Default display should be extremely simple:

Employee Name — X hours

Allow drill-down when requested.

SEND:

Access PM-approved previous-week/pay-period records.

Display:

- employee
- date
- jobsite
- task
- start
- end
- regular hours
- travel hours
- total hours
- accounting code
- notes
- PM approver
- approval timestamp

Sortable/filterable by:

- employee
- jobsite
- date
- accounting code

Actions:

- EMAIL REPORT
- DOWNLOAD CSV

Only approved records may enter finalized accounting exports unless Owner explicitly overrides with audit logging.

Provide OPEN ON DESKTOP button with secure emailed link.

---

# 21. OWNER

OWNER does not automatically clock in.

Owner dashboard:

- LOCATE
- VERIFY
- INFO
- SEND
- SITE VISIT
- ADMIN

Owner receives full authorized visibility.

Owner may perform PM approvals and Controller functions.

---

# 22. OWNER SITE VISIT

SITE VISIT workflow:

Select existing jobsite OR add/select appropriate project if permissions allow.

START SITE VISIT

Record timestamp.

On appropriate subsequent scan/open:

Display active Site Visit.

Allow:

RETURNED / END SITE VISIT

Record duration and project association.

Site Visits should be reportable separately from employee payroll unless Admin configures otherwise.

---

# 23. ADMIN

Create a responsive Admin dashboard optimized primarily for desktop.

Manage:

EMPLOYEES
JOBSITES
TASKS
ACCOUNTING CODES
TRUCKS
QR CODES
PERMISSIONS
TIME SETTINGS
REPORT SETTINGS
AUDIT LOG

Employee fields should include at minimum:

- first name
- last name
- email
- active/inactive
- earliest paid start
- permissions/modes
- available jobsites
- available tasks
- PM assignment/access
- timezone if needed
- account status

Jobsites:

- project name
- project number
- optional address
- active/inactive
- assigned employees
- assigned PMs
- available tasks
- accounting code mappings

Tasks:

- name
- active/inactive
- availability/mappings

Accounting Codes:

- code
- description
- active/inactive
- applicable project/task mappings

Trucks:

- truck name/number
- active/inactive
- QR identity
- last inferred status/location

Completed/inactive records must never delete historical time records.

---

# 24. CSV ADMIN IMPORT

Desktop Admin must support CSV import for:

- Employees
- Jobsites
- Tasks
- Accounting Codes
- employee/jobsite availability where practical
- task/accounting mappings where practical

Provide:

- downloadable CSV templates
- preview before import
- validation
- row-level errors
- confirmation before committing
- duplicate handling

Do not partially import corrupt data without clearly reporting what occurred.

---

# 25. REPORTING

Create reporting engine capable of filtering by:

- date range
- employee
- jobsite
- task
- accounting code
- status
- PM
- work type
- travel

Support CSV export.

Use decimal hours carefully and avoid cumulative floating-point payroll errors.

Store durations based on timestamps and calculate/report with appropriate precision.

---

# 26. TIME RECORD DATA MODEL

Design normalized PostgreSQL schema.

Likely entities include:

User
Role/Permission
UserPermission
Jobsite
Task
AccountingCode
Truck
QrCode
WorkDay
TimeSegment
SiteVisit
Approval
AuditLog
JobsiteUserAssignment
TaskAssignment
AccountingMapping
EmailToken / secure action token

Adapt schema where appropriate.

Every TimeSegment should support:

- employee
- work day
- type
- jobsite
- task
- truck if applicable
- original start
- effective start
- end
- notes
- accounting code
- approval status
- created/modified metadata

Types should include:

SHOP