param([switch]$Live,[switch]$Crud)
$ErrorActionPreference='Stop'
$base='http://127.0.0.1:8000'
Write-Host 'MUSE Nova Phase 6 readiness (no Meta API charges)'
$h=Invoke-RestMethod "$base/health"
Write-Host "Backend version: $($h.version)"
$status=Invoke-RestMethod "$base/v1/memory/status"
Write-Host "Enabled: $($status.enabled); status: $($status.status); checkpoint: $($status.checkpointing)"
if($status.status -ne 'ready'){ throw 'Memory is not ready. Check Docker, .env and required packages.' }
$list=Invoke-RestMethod "$base/v1/memory/items"
Write-Host "Saved memories: $($list.items.Count)"
$threads=Invoke-RestMethod "$base/v1/memory/threads?category=chat"
Write-Host "Persistent chat threads: $($threads.items.Count)"
if($Crud){
  Write-Host 'Testing PostgreSQL memory save/search/edit/delete (no Meta API charges)...'
  $unique="MUSE Nova Phase 6 smoke memory $([guid]::NewGuid().ToString('N'))"
  $new=@{kind='project';content=$unique}|ConvertTo-Json
  $entry=Invoke-RestMethod "$base/v1/memory/items" -Method Post -ContentType 'application/json' -Body $new
  try{
    if($entry.content -ne $unique){throw 'Saved memory mismatch'}
    $search=@{query=$unique;limit=5}|ConvertTo-Json
    $found=Invoke-RestMethod "$base/v1/memory/search" -Method Post -ContentType 'application/json' -Body $search
    if(@($found.items | Where-Object id -eq $entry.id).Count -lt 1){throw 'Saved memory not retrieved'}
    $patched=@{kind='project';content="$unique updated"}|ConvertTo-Json
    $edited=Invoke-RestMethod "$base/v1/memory/items/$($entry.id)" -Method Patch -ContentType 'application/json' -Body $patched
    if($edited.content -ne "$unique updated"){throw 'Edit failed'}
  } finally {
    Invoke-RestMethod "$base/v1/memory/items/$($entry.id)" -Method Delete | Out-Null
  }
  Write-Host 'MEMORY CRUD CHECK PASSED (test memory removed).'
}
if($Live){
  Write-Host 'Making one billable Muse request to test durable chat...'
  $body=@{message='For a test, reply in one short sentence.'}|ConvertTo-Json
  $resp=Invoke-RestMethod "$base/v1/chat" -Method Post -ContentType 'application/json' -Body $body
  Write-Host "Conversation ID: $($resp.conversation_id)"
  Write-Host "Answer: $($resp.answer)"
  $followup=@{message='What was my previous request?';conversation_id=$resp.conversation_id}|ConvertTo-Json
  $second=Invoke-RestMethod "$base/v1/chat" -Method Post -ContentType 'application/json' -Body $followup
  Write-Host "Follow-up: $($second.answer)"
  $thread=Invoke-RestMethod "$base/v1/memory/threads/$($resp.conversation_id)?category=chat"
  Write-Host "Checkpoint transcript turns: $($thread.history.Count)"
  if($thread.history.Count -lt 4){ throw 'Two requests were not preserved in graph history.' }
  Write-Host 'LIVE CHECK PASSED; now restart FastAPI and resume from the Memory Center to verify restart durability.'
}
