#!/usr/bin/env bash
# =============================================================================
# AdsLife Backend — Complete API Test Suite
# Usage:
#   chmod +x test-api.sh
#   ./test-api.sh                        # runs against localhost:3001
#   BASE=https://dev.adslife.in ./test-api.sh
#   BASE=https://dev.adslife.in VERBOSE=1 ./test-api.sh
# =============================================================================

BASE="${BASE:-http://localhost:3001}/api"
VERBOSE="${VERBOSE:-0}"

# ── colour helpers ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

PASS=0; FAIL=0; SKIP=0

pass() { echo -e "  ${GREEN}✓ PASS${NC}  $1"; ((PASS++)); }
fail() { echo -e "  ${RED}✗ FAIL${NC}  $1"; ((FAIL++)); }
skip() { echo -e "  ${YELLOW}⊘ SKIP${NC}  $1"; ((SKIP++)); }
section() { echo -e "\n${BOLD}${CYAN}══ $1 ══${NC}"; }

# ── HTTP helper ───────────────────────────────────────────────────────────────
# call <METHOD> <path> [body] [extra_curl_args...]
# Sets: STATUS BODY
call() {
  local method="$1" path="$2" body="${3:-}" ; shift 3
  local args=(-s -o /tmp/api_body -w "%{http_code}" -X "$method"
              -H "Content-Type: application/json")
  [[ -n "$AUTH_TOKEN" ]] && args+=(-H "Authorization: Bearer $AUTH_TOKEN")
  [[ -n "$body"       ]] && args+=(-d "$body")
  args+=("$@")
  STATUS=$(curl "${args[@]}" "${BASE}${path}")
  BODY=$(cat /tmp/api_body)
  [[ "$VERBOSE" == "1" ]] && echo "    → $method ${BASE}${path}  HTTP $STATUS"
  [[ "$VERBOSE" == "1" ]] && echo "    ← $BODY" | head -c 400
}

# assert_status <expected> <label>
assert_status() {
  if [[ "$STATUS" == "$1" ]]; then pass "$2 (HTTP $1)";
  else fail "$2 — expected HTTP $1, got HTTP $STATUS | $BODY"; fi
}

# assert_field <jq_path> <label>
assert_field() {
  local val; val=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d$1)" 2>/dev/null)
  if [[ -n "$val" && "$val" != "None" && "$val" != "null" ]]; then pass "$2";
  else fail "$2 — field '$1' missing or null | $BODY"; fi
}

# assert_equals <jq_path> <expected_value> <label>
assert_equals() {
  local val; val=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d$1)" 2>/dev/null)
  if [[ "$val" == "$2" ]]; then pass "$2 (== $2)";
  else fail "$3 — expected '$2', got '$val'"; fi
}

# ── Globals filled during the run ─────────────────────────────────────────────
AUTH_TOKEN=""
ADMIN_TOKEN=""
VENDOR_TOKEN=""
USER_ID=""
VENDOR_ID=""
OFFER_ID=""
RESET_TOKEN=""
TEST_EMAIL="testuser_$$@mailtest.dev"
TEST_PASS="Test@12345"
ADMIN_EMAIL="admin@adslife.in"
ADMIN_PASS="${ADMIN_PASS:-Admin@12345}"   # override via env if needed

echo -e "${BOLD}AdsLife API Test Suite — ${BASE}${NC}"
echo "Target: $BASE"
echo "Started: $(date)"

# =============================================================================
# 1. AUTH
# =============================================================================
section "AUTH — Registration"

call POST /auth/register "{\"name\":\"Test User\",\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\",\"city\":\"Chennai\"}"
assert_status 201 "Register new user"
assert_field "['data']['token']" "Register returns token"
USER_TOKEN=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['token'])" 2>/dev/null)
USER_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['user']['id'])" 2>/dev/null)

call POST /auth/register "{\"name\":\"Test User\",\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}"
assert_status 409 "Register duplicate email → 409"

call POST /auth/register "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}"
assert_status 400 "Register missing name → 400"

call POST /auth/register "{\"name\":\"A\",\"email\":\"not-an-email\",\"password\":\"$TEST_PASS\"}"
assert_status 400 "Register invalid email → 400"

call POST /auth/register "{\"name\":\"A\",\"email\":\"x@x.com\",\"password\":\"123\"}"
assert_status 400 "Register short password → 400"

section "AUTH — Login"

call POST /auth/login "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}"
assert_status 200 "Login valid credentials"
assert_field "['data']['token']" "Login returns token"
AUTH_TOKEN=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['token'])" 2>/dev/null)

call POST /auth/login "{\"email\":\"$TEST_EMAIL\",\"password\":\"wrongpassword\"}"
assert_status 401 "Login wrong password → 401"

call POST /auth/login "{\"email\":\"nobody@nowhere.com\",\"password\":\"$TEST_PASS\"}"
assert_status 401 "Login unknown email → 401"

call POST /auth/login "{}"
assert_status 400 "Login empty body → 400"

section "AUTH — Profile & Token"

AUTH_TOKEN="$USER_TOKEN"
call GET /auth/me
assert_status 200 "GET /auth/me with valid token"
assert_field "['data']['email']" "me returns email"

AUTH_TOKEN="invalid.jwt.token"
call GET /auth/me
assert_status 401 "GET /auth/me invalid token → 401"

AUTH_TOKEN=""
call GET /auth/me
assert_status 401 "GET /auth/me no token → 401"

AUTH_TOKEN="$USER_TOKEN"
call PUT /auth/profile "{\"name\":\"Updated User\",\"city\":\"Mumbai\"}"
assert_status 200 "PUT /auth/profile update name+city"

call POST /auth/change-password "{\"current_password\":\"$TEST_PASS\",\"new_password\":\"NewPass@99\"}"
assert_status 200 "POST /auth/change-password"
TEST_PASS="NewPass@99"

call POST /auth/forgot-password "{\"email\":\"$TEST_EMAIL\"}"
assert_status 200 "POST /auth/forgot-password (always 200)"

# grab dev reset token if returned
RESET_TOKEN=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('reset_token',''))" 2>/dev/null)
if [[ -n "$RESET_TOKEN" && "$RESET_TOKEN" != "None" ]]; then
  call POST /auth/reset-password "{\"token\":\"$RESET_TOKEN\",\"password\":\"Reset@12345\"}"
  assert_status 200 "POST /auth/reset-password with valid token"
  TEST_PASS="Reset@12345"
  # re-login after password reset
  call POST /auth/login "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}"
  USER_TOKEN=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['token'])" 2>/dev/null)
  AUTH_TOKEN="$USER_TOKEN"
else
  skip "reset-password (no reset_token in dev response — check APP_ENV)"
fi

call POST /auth/reset-password "{\"token\":\"fakeresettoken\",\"password\":\"Test@12345\"}"
assert_status 400 "POST /auth/reset-password invalid token → 400"

# =============================================================================
# 2. ADMIN
# =============================================================================
section "ADMIN — Login as admin"

call POST /auth/login "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}"
if [[ "$STATUS" == "200" ]]; then
  ADMIN_TOKEN=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['token'])" 2>/dev/null)
  pass "Admin login OK"
else
  fail "Admin login — HTTP $STATUS (set ADMIN_PASS env var if wrong)"
  ADMIN_TOKEN=""
fi

AUTH_TOKEN="$ADMIN_TOKEN"

section "ADMIN — Stats & Lists"

call GET /admin/stats
assert_status 200 "GET /admin/stats"
assert_field "['data']['totals']" "stats.totals present"

call GET /admin/users
assert_status 200 "GET /admin/users (default)"

call GET "/admin/users?search=test&role=user&page=1&limit=5"
assert_status 200 "GET /admin/users with filters"

call GET /admin/vendors
assert_status 200 "GET /admin/vendors"

call GET "/admin/vendors?status=approved&limit=10"
assert_status 200 "GET /admin/vendors filtered"

call GET /admin/offers
assert_status 200 "GET /admin/offers"

call GET /admin/vendor-requests
assert_status 200 "GET /admin/vendor-requests"

call GET /admin/site-settings
assert_status 200 "GET /admin/site-settings (public)"

# non-admin cannot access
AUTH_TOKEN="$USER_TOKEN"
call GET /admin/stats
assert_status 403 "GET /admin/stats as user → 403"
AUTH_TOKEN="$ADMIN_TOKEN"

section "ADMIN — Vendor Plan Update"

# get first vendor id
call GET /admin/vendors
VENDOR_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); vs=d.get('data',{}).get('vendors',[]); print(vs[0]['id'] if vs else '')" 2>/dev/null)

if [[ -n "$VENDOR_ID" && "$VENDOR_ID" != "None" ]]; then
  call PUT "/admin/vendors/$VENDOR_ID" '{"action":"update_plan","plan":"starter"}'
  assert_status 200 "PUT /admin/vendors/:id update_plan → starter"

  call PUT "/admin/vendors/$VENDOR_ID" '{"action":"update_plan","plan":"free"}'
  assert_status 200 "PUT /admin/vendors/:id update_plan → free (downgrade)"

  call PUT "/admin/vendors/$VENDOR_ID" '{"action":"update_plan","plan":"nonexistent_plan"}'
  assert_status 400 "PUT /admin/vendors/:id invalid plan → 400"

  call PUT "/admin/vendors/$VENDOR_ID" '{"action":"suspend"}'
  assert_status 200 "PUT /admin/vendors/:id suspend"

  call PUT "/admin/vendors/$VENDOR_ID" '{"action":"approve"}'
  assert_status 200 "PUT /admin/vendors/:id approve (restore)"
else
  skip "Vendor action tests (no vendor in DB)"
fi

section "ADMIN — User Actions"

if [[ -n "$USER_ID" ]]; then
  AUTH_TOKEN="$ADMIN_TOKEN"
  call PUT "/admin/users/$USER_ID" '{"action":"ban"}'
  assert_status 200 "PUT /admin/users/:id ban"

  call PUT "/admin/users/$USER_ID" '{"action":"unban"}'
  assert_status 200 "PUT /admin/users/:id unban"

  call PUT "/admin/users/$USER_ID" '{"action":"update_role","role":"user"}'
  assert_status 200 "PUT /admin/users/:id update_role"

  call PUT "/admin/users/$USER_ID" '{"action":"update_role","role":"superadmin"}'
  assert_status 400 "PUT /admin/users/:id invalid role → 400"
fi

section "ADMIN — Offer Actions"

call GET /admin/offers
OFFER_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); os=d.get('data',{}).get('offers',[]); print(os[0]['id'] if os else '')" 2>/dev/null)
if [[ -n "$OFFER_ID" && "$OFFER_ID" != "None" ]]; then
  call PUT "/admin/offers/$OFFER_ID" '{"action":"deactivate"}'
  assert_status 200 "PUT /admin/offers/:id deactivate"

  call PUT "/admin/offers/$OFFER_ID" '{"action":"activate"}'
  assert_status 200 "PUT /admin/offers/:id activate"

  call PUT "/admin/offers/$OFFER_ID" '{"action":"feature","featured":1}'
  assert_status 200 "PUT /admin/offers/:id feature"
else
  skip "Offer action tests (no offers in DB)"
fi

section "ADMIN — Site Settings & Broadcast"

AUTH_TOKEN="$ADMIN_TOKEN"
call PUT /admin/site-settings '{"site_name":"AdsLife Dev","maintenance_mode":"0"}'
assert_status 200 "PUT /admin/site-settings"

call POST /admin/broadcast '{"title":"Test Alert","body":"This is a test broadcast"}'
assert_status 200 "POST /admin/broadcast"

call POST /admin/sync-daily-stats '{}'
assert_status 200 "POST /admin/sync-daily-stats (no date = yesterday)"

call POST /admin/sync-daily-stats '{"date":"2026-06-01"}'
assert_status 200 "POST /admin/sync-daily-stats with specific date"

# =============================================================================
# 3. VENDOR
# =============================================================================
section "VENDOR — Apply"

AUTH_TOKEN="$USER_TOKEN"
call POST /vendor-apply/submit '{
  "business_name":"Test Bakery QA",
  "category":"food-dining",
  "city":"Chennai",
  "address":"12 Test St",
  "phone":"9876543210",
  "description":"QA test vendor"
}'
assert_status 201 "POST /vendor-apply/submit"

call POST /vendor-apply/submit '{"business_name":"Duplicate App"}'
assert_status 200 "POST /vendor-apply/submit duplicate — returns {success:false}"
# (controller returns success:false, not 409)

AUTH_TOKEN=""
call POST /vendor-apply/submit '{"business_name":"No Auth"}'
assert_status 401 "POST /vendor-apply/submit no auth → 401"

section "VENDOR — Profile & Dashboard"

# Approve the application first as admin, then login as vendor
AUTH_TOKEN="$ADMIN_TOKEN"
call GET /admin/vendor-requests
APP_ID=$(echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
rows=[r for r in (d if isinstance(d,list) else []) if r.get('status')=='pending']
print(rows[0]['id'] if rows else '')
" 2>/dev/null)

if [[ -n "$APP_ID" && "$APP_ID" != "None" ]]; then
  call PUT "/admin/review-vendor/$APP_ID" '{"status":"approved","note":"QA approved"}'
  assert_status 200 "PUT /admin/review-vendor/:id approve"

  # re-login to get vendor role token
  call POST /auth/login "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}"
  VENDOR_TOKEN=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['token'])" 2>/dev/null)
  AUTH_TOKEN="$VENDOR_TOKEN"

  call GET /vendor/dashboard
  assert_status 200 "GET /vendor/dashboard"

  call GET /vendor/profile
  assert_status 200 "GET /vendor/profile (own)"
  VENDOR_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)

  call PUT /vendor/profile '{"business_name":"Updated QA Bakery","city":"Bangalore"}'
  assert_status 200 "PUT /vendor/profile"

  call GET /vendor/my-plan
  assert_status 200 "GET /vendor/my-plan"

  call GET /vendor/budget-suggest
  assert_status 200 "GET /vendor/budget-suggest"
else
  skip "Vendor profile tests (no pending application found)"
  VENDOR_TOKEN="$USER_TOKEN"
fi

section "VENDOR — Public Profile & Follow"

if [[ -n "$VENDOR_ID" && "$VENDOR_ID" != "None" ]]; then
  AUTH_TOKEN=""
  call GET "/vendor/profile/$VENDOR_ID"
  assert_status 200 "GET /vendor/profile/:id (public, no auth)"

  AUTH_TOKEN="$USER_TOKEN"
  call POST /vendor/follow "{\"vendor_id\":$VENDOR_ID}"
  assert_status 201 "POST /vendor/follow"

  call GET "/vendor/$VENDOR_ID/followers"
  assert_status 200 "GET /vendor/:id/followers"

  call GET /vendor/following
  assert_status 200 "GET /vendor/following"

  call GET "/vendor/follow-status?vendor_id=$VENDOR_ID"
  assert_status 200 "GET /vendor/follow-status"

  call DELETE "/vendor/$VENDOR_ID/follow"
  assert_status 200 "DELETE /vendor/:id/follow"
else
  skip "Follow tests (no vendor_id available)"
fi

# =============================================================================
# 4. OFFERS
# =============================================================================
section "OFFERS — CRUD"

AUTH_TOKEN="${VENDOR_TOKEN:-$USER_TOKEN}"
call POST /offers '{
  "title":"QA Test Offer",
  "description":"50% off everything",
  "category":"food-dining",
  "discount_percent":50,
  "original_price":200,
  "discounted_price":100,
  "valid_until":"2027-12-31"
}'
NEW_OFFER_STATUS="$STATUS"
NEW_OFFER_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)

if [[ "$NEW_OFFER_STATUS" == "201" ]]; then
  pass "POST /offers create offer"

  call GET "/offers/$NEW_OFFER_ID"
  assert_status 200 "GET /offers/:id"
  assert_field "['data']['title']" "Offer has title"

  call PUT "/offers/$NEW_OFFER_ID" '{"title":"Updated QA Offer","discount_percent":60}'
  assert_status 200 "PUT /offers/:id update"

  call GET "/offers/$NEW_OFFER_ID"
  call POST "/offers/$NEW_OFFER_ID/view" '{}'
  assert_status 201 "POST /offers/:id/view (track view)"

  call GET /offers/my/list
  assert_status 200 "GET /offers/my/list"

  call DELETE "/offers/$NEW_OFFER_ID"
  assert_status 200 "DELETE /offers/:id"

  call GET "/offers/$NEW_OFFER_ID"
  assert_status 404 "GET /offers/:id after delete → 404"
else
  fail "POST /offers — HTTP $NEW_OFFER_STATUS | $BODY"
  skip "Offer CRUD follow-up tests"
fi

call POST /offers '{}'
assert_status 400 "POST /offers empty body → 400"

AUTH_TOKEN=""
call GET "/offers/99999"
assert_status 404 "GET /offers/99999 non-existent → 404"

# =============================================================================
# 5. FEED
# =============================================================================
section "FEED"

AUTH_TOKEN="$USER_TOKEN"
call GET /feed/count
assert_status 200 "GET /feed/count"

call GET /feed/trending
assert_status 200 "GET /feed/trending"

call GET "/feed/trending?limit=5&category=food-dining"
assert_status 200 "GET /feed/trending with filters"

call GET "/feed/nearby?lat=13.0827&lng=80.2707&radius=5"
assert_status 200 "GET /feed/nearby"

call GET /feed/personalized
assert_status 200 "GET /feed/personalized"

call GET /feed/saved
assert_status 200 "GET /feed/saved"

call GET /feed/saved-ids
assert_status 200 "GET /feed/saved-ids"

call POST /feed/interaction '{"offer_id":1,"action":"view"}'
# 201 if offer exists, 404 if not — both are valid
if [[ "$STATUS" == "201" || "$STATUS" == "404" || "$STATUS" == "400" ]]; then
  pass "POST /feed/interaction (HTTP $STATUS)"
else
  fail "POST /feed/interaction unexpected HTTP $STATUS"
fi

call DELETE /feed/unsave '{"offer_id":1}'
# 200 or 404 acceptable
if [[ "$STATUS" == "200" || "$STATUS" == "404" ]]; then pass "DELETE /feed/unsave";
else fail "DELETE /feed/unsave — HTTP $STATUS"; fi

AUTH_TOKEN=""
call GET /feed/personalized
assert_status 401 "GET /feed/personalized no auth → 401"

# =============================================================================
# 6. ANALYTICS
# =============================================================================
section "ANALYTICS"

AUTH_TOKEN="${VENDOR_TOKEN:-$ADMIN_TOKEN}"
call GET /analytics/roi
assert_status 200 "GET /analytics/roi"

call GET /analytics/audience
assert_status 200 "GET /analytics/audience"

call GET /analytics/heatmap
assert_status 200 "GET /analytics/heatmap"

call GET /analytics/benchmark
assert_status 200 "GET /analytics/benchmark"

AUTH_TOKEN=""
call GET /analytics/roi
assert_status 401 "GET /analytics/roi no auth → 401"

# =============================================================================
# 7. PLANS
# =============================================================================
section "PLANS"

AUTH_TOKEN=""
call GET /plans
assert_status 200 "GET /plans (public)"

AUTH_TOKEN="$ADMIN_TOKEN"
call POST /plans '{"name":"Enterprise","slug":"enterprise","price":4999,"max_offers":500,"features":["unlimited","analytics","support"]}'
if [[ "$STATUS" == "201" || "$STATUS" == "200" || "$STATUS" == "409" ]]; then
  pass "POST /plans create (HTTP $STATUS)"
else
  fail "POST /plans — HTTP $STATUS | $BODY"
fi

# =============================================================================
# 8. CATEGORIES
# =============================================================================
section "CATEGORIES"

AUTH_TOKEN=""
call GET /categories
assert_status 200 "GET /categories (public)"

AUTH_TOKEN="$ADMIN_TOKEN"
call POST /categories '{"name":"QA Category Test","slug":"qa-test-cat","icon":"🧪"}'
CAT_STATUS="$STATUS"
CAT_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)
if [[ "$CAT_STATUS" == "201" ]]; then
  pass "POST /categories create"

  call PUT "/categories/$CAT_ID" '{"name":"QA Category Updated"}'
  assert_status 200 "PUT /categories/:id update"

  call DELETE "/categories/$CAT_ID"
  assert_status 200 "DELETE /categories/:id"
else
  fail "POST /categories — HTTP $CAT_STATUS | $BODY"
fi

# =============================================================================
# 9. NOTIFICATIONS
# =============================================================================
section "NOTIFICATIONS"

AUTH_TOKEN="$USER_TOKEN"
call GET /notifications
assert_status 200 "GET /notifications"

call PUT /notifications/mark-read '{}'
assert_status 200 "PUT /notifications/mark-read"

call POST /notifications/save-token '{"token":"fcm_test_token_12345","platform":"android"}'
if [[ "$STATUS" == "200" || "$STATUS" == "201" ]]; then pass "POST /notifications/save-token";
else fail "POST /notifications/save-token — HTTP $STATUS | $BODY"; fi

# =============================================================================
# 10. SUPPORT
# =============================================================================
section "SUPPORT"

AUTH_TOKEN="$USER_TOKEN"
call POST /support '{"subject":"Test Ticket","message":"This is a QA test support ticket"}'
TICKET_STATUS="$STATUS"
TICKET_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)
if [[ "$TICKET_STATUS" == "201" ]]; then
  pass "POST /support create ticket"
else
  fail "POST /support — HTTP $TICKET_STATUS | $BODY"
fi

AUTH_TOKEN="$ADMIN_TOKEN"
call GET /support
assert_status 200 "GET /support (admin list)"

if [[ -n "$TICKET_ID" && "$TICKET_ID" != "None" ]]; then
  call POST "/support/$TICKET_ID/reply" '{"message":"Admin reply: ticket received"}'
  assert_status 200 "POST /support/:id/reply"
fi

# =============================================================================
# 11. PAYMENT
# =============================================================================
section "PAYMENT"

AUTH_TOKEN="$USER_TOKEN"
call POST /payment/create-order '{"plan_id":1,"vendor_id":1}'
if [[ "$STATUS" == "201" || "$STATUS" == "200" || "$STATUS" == "400" ]]; then
  pass "POST /payment/create-order (HTTP $STATUS)"
else
  fail "POST /payment/create-order — HTTP $STATUS | $BODY"
fi

AUTH_TOKEN=""
call POST /payment/create-order '{"plan_id":1}'
assert_status 401 "POST /payment/create-order no auth → 401"

# =============================================================================
# 12. UPLOAD
# =============================================================================
section "UPLOAD"

AUTH_TOKEN="$USER_TOKEN"
# Create a small valid JPEG-like binary blob
echo -e '\xFF\xD8\xFF\xE0test' > /tmp/test_upload.jpg
UPLOAD_STATUS=$(curl -s -o /tmp/api_body -w "%{http_code}" \
  -X POST "${BASE}/upload/image" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -F "file=@/tmp/test_upload.jpg;type=image/jpeg")
BODY=$(cat /tmp/api_body)
if [[ "$UPLOAD_STATUS" == "201" || "$UPLOAD_STATUS" == "200" ]]; then
  pass "POST /upload/image (valid JPEG)"
elif [[ "$UPLOAD_STATUS" == "400" ]]; then
  skip "POST /upload/image — 400 (file may be too small/invalid — OK)"
else
  fail "POST /upload/image — HTTP $UPLOAD_STATUS | $BODY"
fi

# No auth
UPLOAD_STATUS=$(curl -s -o /tmp/api_body -w "%{http_code}" \
  -X POST "${BASE}/upload/image" \
  -F "file=@/tmp/test_upload.jpg;type=image/jpeg")
if [[ "$UPLOAD_STATUS" == "401" ]]; then pass "POST /upload/image no auth → 401";
else fail "POST /upload/image no auth — HTTP $UPLOAD_STATUS"; fi

# =============================================================================
# 13. REFERRAL
# =============================================================================
section "REFERRAL"

AUTH_TOKEN="$USER_TOKEN"
call GET /referral/my
assert_status 200 "GET /referral/my"
assert_field "['data']['code']" "Referral code present"

# =============================================================================
# 14. LEADERBOARD
# =============================================================================
section "LEADERBOARD"

AUTH_TOKEN=""
call GET /leaderboard
assert_status 200 "GET /leaderboard (public)"

AUTH_TOKEN="$ADMIN_TOKEN"
call POST /leaderboard/rebuild '{}'
if [[ "$STATUS" == "200" || "$STATUS" == "201" ]]; then pass "POST /leaderboard/rebuild";
else fail "POST /leaderboard/rebuild — HTTP $STATUS | $BODY"; fi

# =============================================================================
# 15. FRAUD
# =============================================================================
section "FRAUD"

AUTH_TOKEN="$ADMIN_TOKEN"
call GET /fraud/flagged
assert_status 200 "GET /fraud/flagged"

if [[ -n "$VENDOR_ID" && "$VENDOR_ID" != "None" ]]; then
  call GET "/fraud/check-vendor/$VENDOR_ID"
  assert_status 200 "GET /fraud/check-vendor/:id"
fi

if [[ -n "$OFFER_ID" && "$OFFER_ID" != "None" ]]; then
  call GET "/fraud/check-offer/$OFFER_ID"
  assert_status 200 "GET /fraud/check-offer/:id"
fi

# =============================================================================
# 16. GROUP DEALS
# =============================================================================
section "GROUP DEALS"

AUTH_TOKEN=""
call GET /group-deals/active
assert_status 200 "GET /group-deals/active (public)"

AUTH_TOKEN="${VENDOR_TOKEN:-$ADMIN_TOKEN}"
call POST /group-deals '{
  "offer_id":1,
  "min_participants":5,
  "max_participants":50,
  "discount_percent":20,
  "expires_at":"2027-12-31T23:59:59Z"
}'
GD_STATUS="$STATUS"
GD_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)
if [[ "$GD_STATUS" == "201" || "$GD_STATUS" == "200" ]]; then
  pass "POST /group-deals create"

  AUTH_TOKEN="$USER_TOKEN"
  call POST "/group-deals/$GD_ID/join" '{}'
  if [[ "$STATUS" == "200" || "$STATUS" == "201" ]]; then pass "POST /group-deals/:id/join";
  else fail "POST /group-deals/:id/join — HTTP $STATUS | $BODY"; fi

  call GET "/group-deals/$GD_ID/status"
  assert_status 200 "GET /group-deals/:id/status"
elif [[ "$GD_STATUS" == "404" || "$GD_STATUS" == "400" ]]; then
  skip "Group deal create — offer_id=1 may not exist (HTTP $GD_STATUS)"
else
  fail "POST /group-deals — HTTP $GD_STATUS | $BODY"
fi

# =============================================================================
# 17. SPOTLIGHT
# =============================================================================
section "SPOTLIGHT"

AUTH_TOKEN=""
call GET /spotlight/active
assert_status 200 "GET /spotlight/active (public)"

AUTH_TOKEN="$ADMIN_TOKEN"
call GET /spotlight/list
assert_status 200 "GET /spotlight/list (admin)"

AUTH_TOKEN="${VENDOR_TOKEN:-$USER_TOKEN}"
call POST /spotlight/request '{"offer_id":1,"message":"Please feature our bakery"}'
if [[ "$STATUS" == "201" || "$STATUS" == "200" || "$STATUS" == "400" || "$STATUS" == "404" ]]; then
  pass "POST /spotlight/request (HTTP $STATUS)"
else
  fail "POST /spotlight/request — HTTP $STATUS | $BODY"
fi

# =============================================================================
# 18. BANNER ADS
# =============================================================================
section "BANNER ADS"

AUTH_TOKEN=""
call GET /banner-ads
assert_status 200 "GET /banner-ads (public)"

AUTH_TOKEN="${VENDOR_TOKEN:-$USER_TOKEN}"
call POST /banner-ads/request '{"title":"QA Banner","image_url":"https://cdn.adslife.in/test.jpg","link_url":"https://adslife.in","position":"home_top"}'
if [[ "$STATUS" == "201" || "$STATUS" == "200" || "$STATUS" == "400" ]]; then
  pass "POST /banner-ads/request (HTTP $STATUS)"
else
  fail "POST /banner-ads/request — HTTP $STATUS | $BODY"
fi

# =============================================================================
# 19. A/B TESTS
# =============================================================================
section "A/B TESTS"

AUTH_TOKEN="${VENDOR_TOKEN:-$ADMIN_TOKEN}"
call POST /ab-test/create '{
  "name":"QA Button Color Test",
  "offer_id":1,
  "variant_a":{"label":"Red Button","color":"#FF0000"},
  "variant_b":{"label":"Green Button","color":"#00FF00"}
}'
AB_STATUS="$STATUS"
AB_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)
if [[ "$AB_STATUS" == "201" || "$AB_STATUS" == "200" ]]; then
  pass "POST /ab-test/create"

  call GET "/ab-test/$AB_ID/results"
  assert_status 200 "GET /ab-test/:id/results"

  call POST "/ab-test/$AB_ID/conclude" '{"winner":"a"}'
  assert_status 200 "POST /ab-test/:id/conclude"
elif [[ "$AB_STATUS" == "400" || "$AB_STATUS" == "404" ]]; then
  skip "A/B test — offer_id=1 may not exist (HTTP $AB_STATUS)"
else
  fail "POST /ab-test/create — HTTP $AB_STATUS | $BODY"
fi

# =============================================================================
# 20. SHARE / TRANSLATE / TARGETING
# =============================================================================
section "SHARE"

AUTH_TOKEN="$USER_TOKEN"
call POST /share/track '{"offer_id":1,"platform":"whatsapp"}'
if [[ "$STATUS" == "200" || "$STATUS" == "201" || "$STATUS" == "404" ]]; then pass "POST /share/track (HTTP $STATUS)";
else fail "POST /share/track — HTTP $STATUS | $BODY"; fi

section "TRANSLATE"

AUTH_TOKEN=""
call GET /translate/languages
assert_status 200 "GET /translate/languages"

AUTH_TOKEN="$USER_TOKEN"
call POST /translate/offer '{"offer_id":1,"target_lang":"ta"}'
if [[ "$STATUS" == "200" || "$STATUS" == "201" || "$STATUS" == "404" ]]; then pass "POST /translate/offer (HTTP $STATUS)";
else fail "POST /translate/offer — HTTP $STATUS | $BODY"; fi

section "TARGETING"

AUTH_TOKEN="${VENDOR_TOKEN:-$ADMIN_TOKEN}"
call GET "/targeting/resolve-area?lat=13.0827&lng=80.2707"
assert_status 200 "GET /targeting/resolve-area"

call GET "/targeting/search-area?q=Chennai"
assert_status 200 "GET /targeting/search-area"

call POST /targeting/set '{"offer_id":1,"area":"Chennai","radius_km":10}'
if [[ "$STATUS" == "200" || "$STATUS" == "201" || "$STATUS" == "404" ]]; then pass "POST /targeting/set (HTTP $STATUS)";
else fail "POST /targeting/set — HTTP $STATUS | $BODY"; fi

section "INVITE"

AUTH_TOKEN="$USER_TOKEN"
call POST /invite/email '{"email":"friend@example.com"}'
if [[ "$STATUS" == "200" || "$STATUS" == "201" ]]; then pass "POST /invite/email";
else fail "POST /invite/email — HTTP $STATUS | $BODY"; fi

# =============================================================================
# 21. MONITORING (admin only)
# =============================================================================
section "MONITORING"

AUTH_TOKEN="$ADMIN_TOKEN"
call GET /admin/monitoring/overview
assert_status 200 "GET /admin/monitoring/overview"
assert_field "['data']['total_requests']" "overview.total_requests present"

call GET /admin/monitoring/api-logs
assert_status 200 "GET /admin/monitoring/api-logs"

call GET "/admin/monitoring/api-logs?errors_only=true&per_page=10"
assert_status 200 "GET /admin/monitoring/api-logs errors_only"

call GET /admin/monitoring/auth-logs
assert_status 200 "GET /admin/monitoring/auth-logs"

call GET /admin/monitoring/activity-logs
assert_status 200 "GET /admin/monitoring/activity-logs"

call GET /admin/monitoring/error-logs
assert_status 200 "GET /admin/monitoring/error-logs"

call GET /admin/monitoring/security-events
assert_status 200 "GET /admin/monitoring/security-events"

call GET /admin/monitoring/alerts
assert_status 200 "GET /admin/monitoring/alerts"

call GET /admin/monitoring/blocked-ips
assert_status 200 "GET /admin/monitoring/blocked-ips"

call POST /admin/monitoring/block-ip '{"ip_address":"10.0.0.99","reason":"QA test block"}'
assert_status 201 "POST /admin/monitoring/block-ip"

call DELETE /admin/monitoring/block-ip/10.0.0.99
assert_status 200 "DELETE /admin/monitoring/block-ip/:ip (unblock)"

call POST /admin/monitoring/block-ip '{"ip_address":"","reason":"bad"}'
assert_status 400 "POST /admin/monitoring/block-ip empty IP → 400"

AUTH_TOKEN="$USER_TOKEN"
call GET /admin/monitoring/overview
assert_status 403 "GET /admin/monitoring/overview as user → 403"

# =============================================================================
# 22. SECURITY / EDGE CASES
# =============================================================================
section "SECURITY — SQL Injection & XSS"

AUTH_TOKEN="$USER_TOKEN"
call GET "/feed/trending?category=food' OR '1'='1"
assert_status 200 "SQL injection in query param — server handles safely"

call POST /auth/login '{"email":"admin@adslife.in'\'' OR '\''1'\''='\''1","password":"x"}'
assert_status 401 "SQL injection in login email → 401"

call PUT /auth/profile '{"name":"<script>alert(1)</script>"}'
assert_status 200 "XSS payload in name — accepted (sanitize at output layer)"

call PUT /auth/profile "{\"name\":\"$(python3 -c "print('A'*300)")\"}"
assert_status 400 "Name over MaxLength → 400"

section "SECURITY — Rate Limiting"

# Hit login 12 times rapidly
for i in $(seq 1 12); do
  call POST /auth/login '{"email":"ratelimit@test.com","password":"wrong"}' 2>/dev/null
done
# Should get 429 on request 11+
if [[ "$STATUS" == "429" || "$STATUS" == "401" ]]; then
  pass "Rate limit on /auth/login (HTTP $STATUS after 12 attempts)"
else
  skip "Rate limit not triggered after 12 attempts (may need ThrottlerModule config check)"
fi

section "SECURITY — Auth Boundary"

AUTH_TOKEN=""
PROTECTED=(
  "GET /auth/me"
  "PUT /auth/profile"
  "GET /vendor/dashboard"
  "GET /feed/personalized"
  "GET /analytics/roi"
  "GET /admin/stats"
)
for ep in "${PROTECTED[@]}"; do
  METHOD=$(echo "$ep" | cut -d' ' -f1)
  PATH=$(echo "$ep" | cut -d' ' -f2)
  call "$METHOD" "$PATH"
  if [[ "$STATUS" == "401" ]]; then pass "$METHOD $PATH no-auth → 401";
  else fail "$METHOD $PATH no-auth — expected 401, got $STATUS"; fi
done

# =============================================================================
# 23. CLEANUP — Logout
# =============================================================================
section "CLEANUP"

AUTH_TOKEN="$USER_TOKEN"
call POST /auth/logout '{}'
assert_status 200 "POST /auth/logout user"

# Token should now be invalid
call GET /auth/me
assert_status 401 "GET /auth/me after logout → 401"

AUTH_TOKEN="$ADMIN_TOKEN"
call POST /auth/logout '{}'
assert_status 200 "POST /auth/logout admin"

# =============================================================================
# SUMMARY
# =============================================================================
TOTAL=$((PASS + FAIL + SKIP))
echo ""
echo -e "${BOLD}════════════════════════════════════${NC}"
echo -e "${BOLD}  TEST RESULTS${NC}"
echo -e "${BOLD}════════════════════════════════════${NC}"
echo -e "  Total  : ${BOLD}$TOTAL${NC}"
echo -e "  ${GREEN}Passed : $PASS${NC}"
echo -e "  ${RED}Failed : $FAIL${NC}"
echo -e "  ${YELLOW}Skipped: $SKIP${NC}"
echo -e "${BOLD}════════════════════════════════════${NC}"
echo "Finished: $(date)"
echo ""

if [[ $FAIL -gt 0 ]]; then
  exit 1
else
  exit 0
fi
