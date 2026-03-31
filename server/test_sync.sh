TOKEN=$(curl -s -X POST http://localhost:5050/api/auth/login -H "Content-Type: application/json" -d '{"email":"svm.singh.01@gmail.com","password":"Qnaup@12345"}' | jq -r .token)
if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo "Login failed."
  exit 1
fi
echo "Got token: $TOKEN"

echo "POSTing a new note..."
curl -s -X POST http://localhost:5050/api/sync -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"notes":[{"id":"test_id_123","title":"Hello from test","content":"test content","folderId":null,"tags":[],"pinned":false,"updatedAt":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}],"folders":[],"deletedNoteIds":[],"deletedFolderIds":[]}'
echo ""
echo "Fetching notes via GET..."
curl -s -X GET "http://localhost:5050/api/sync?page=1&limit=50" -H "Authorization: Bearer $TOKEN" | jq .
