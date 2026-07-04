param(
    [string]$BaseUrl = "http://127.0.0.1:8790",
    [string]$BootstrapSecret = "local-mobile-test-secret-2026"
)

$ErrorActionPreference = "Stop"
$script:WebSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$script:SessionCookie = $null

function Invoke-Tagro {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [object]$Body,
        [string]$Token
    )

    $parameters = @{
        Method = $Method
        Uri = "$BaseUrl$Path"
    }
    $parameters.WebSession = $script:WebSession
    if ($Token) {
        $parameters.Headers = @{ Authorization = "Bearer $Token" }
    }
    if ($null -ne $Body) {
        $parameters.ContentType = "application/json"
        $parameters.Body = $Body | ConvertTo-Json -Depth 12
    }
    Invoke-RestMethod @parameters
}

function Assert-Equal {
    param([object]$Actual, [object]$Expected, [string]$Message)
    if ($Actual -ne $Expected) {
        throw "$Message Expected '$Expected', received '$Actual'."
    }
}

$branchesResponse = Invoke-Tagro -Method Get -Path "/api/public/branches"
if (-not $branchesResponse.branches -or $branchesResponse.branches.Count -eq 0) {
    $bootstrapBody = @{
        branchCode = "KVR"
        branchName = "Kaveripattinam"
        staffName = "Local Owner"
        phone = "9000000000"
        pin = "1234"
    }
    $bootstrapParameters = @{
        Method = "Post"
        Uri = "$BaseUrl/api/bootstrap"
        Headers = @{ "X-Bootstrap-Secret" = $BootstrapSecret }
        ContentType = "application/json"
        Body = $bootstrapBody | ConvertTo-Json
    }
    Invoke-RestMethod @bootstrapParameters | Out-Null
    $branchesResponse = Invoke-Tagro -Method Get -Path "/api/public/branches"
}

$branch = $branchesResponse.branches | Select-Object -First 1
$public = Invoke-Tagro -Method Get -Path "/api/public/staff?branch=$($branch.code)"
$staff = $public.staff | Select-Object -First 1
if (-not $staff) {
    throw "No active local staff account is available."
}

$loginBody = @{
    staffId = $staff.id
    pin = "1234"
} | ConvertTo-Json
$loginResponse = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$BaseUrl/api/auth/login" `
    -WebSession $script:WebSession -ContentType "application/json" -Body $loginBody
$login = $loginResponse.Content | ConvertFrom-Json
$setCookie = [string]$loginResponse.Headers["Set-Cookie"]
$script:SessionCookie = [regex]::Match($setCookie, "tagro_session=([^;]+)").Groups[1].Value
if (-not $script:SessionCookie) { throw "Login cookie was not returned." }
$script:WebSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$cookie = New-Object System.Net.Cookie("tagro_session", $script:SessionCookie, "/", ([uri]$BaseUrl).Host)
$script:WebSession.Cookies.Add($cookie)
$session = Invoke-Tagro -Method Get -Path "/api/auth/session"
if (-not $session.staff.id) { throw "Login session was not established." }
$token = $null

$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$customer = Invoke-Tagro -Method Post -Path "/api/customers" -Token $token -Body @{
    name = "Repair Test $suffix"
    phone = "91$($suffix.ToString().Substring($suffix.ToString().Length - 10))"
    place = "Local Test"
}

$job = Invoke-Tagro -Method Post -Path "/api/repair-jobs" -Token $token -Body @{
    customerId = $customer.customer.id
    branchId = $branch.id
    machineDescription = "STIHL MS 460 chainsaw"
    serialNumber = "TEST-$suffix"
    reportedProblem = "Chain stops under load"
    accessories = @("Bar", "Chain")
}
$jobId = $job.job.id
Assert-Equal $job.job.status "received" "New job status is incorrect."
if (-not $job.job.customer_machine_id) {
    throw "The accepted machine was not saved to the customer's machine history."
}

$machines = Invoke-Tagro -Method Get -Path "/api/customers/$($customer.customer.id)/machines" -Token $token
Assert-Equal $machines.machines.Count 1 "Customer machine history is incomplete."

Invoke-Tagro -Method Post -Path "/api/repair-jobs/$jobId/events" -Token $token -Body @{
    eventType = "inspection_started"
    note = "Initial inspection started"
} | Out-Null

$estimate = Invoke-Tagro -Method Put -Path "/api/repair-jobs/$jobId/estimate" -Token $token -Body @{
    notes = "Test estimate"
    items = @(
        @{
            itemType = "service"
            description = "Inspection and repair labour"
            hsnSac = "998729"
            quantity = 1
            unitPrice = 500
            gstRate = 18
        },
        @{
            itemType = "part"
            partNumber = "TEST-PART"
            description = "Test clutch component"
            hsnSac = "84679100"
            quantity = 2
            unitPrice = 100
            gstRate = 18
        }
    )
}
Assert-Equal ([decimal]$estimate.estimate.grand_total) ([decimal]826) "Estimate total is incorrect."

Invoke-Tagro -Method Post -Path "/api/repair-jobs/$jobId/events" -Token $token -Body @{
    eventType = "inspection_completed"
    note = "Estimate prepared"
} | Out-Null
Invoke-Tagro -Method Post -Path "/api/repair-jobs/$jobId/events" -Token $token -Body @{
    eventType = "estimate_approved"
    note = "Customer approved"
} | Out-Null
Invoke-Tagro -Method Post -Path "/api/repair-jobs/$jobId/events" -Token $token -Body @{
    eventType = "repair_started"
    note = "Work started"
} | Out-Null

$service = Invoke-Tagro -Method Get -Path "/api/repair-jobs/$jobId/service-record" -Token $token
Assert-Equal $service.suggestedItems.Count 2 "Estimate items were not copied into the service-record starting point."

$actualItems = @(
    @{
        itemType = "service"
        description = "Inspection and repair labour"
        hsnSac = "998729"
        quantity = 1
        unitPrice = 500
        gstRate = 18
    },
    @{
        itemType = "part"
        partNumber = "TEST-PART"
        description = "Test clutch component"
        hsnSac = "84679100"
        quantity = 1
        unitPrice = 100
        gstRate = 18
    }
)
$draft = Invoke-Tagro -Method Put -Path "/api/repair-jobs/$jobId/service-record" -Token $token -Body @{
    technicianId = $staff.id
    diagnosis = "Clutch component worn"
    workPerformed = "Inspected machine and replaced the worn clutch component"
    notes = "Local integration test"
    items = $actualItems
}
Assert-Equal $draft.serviceRecord.status "draft" "Service record draft was not saved."

$completed = Invoke-Tagro -Method Post -Path "/api/repair-jobs/$jobId/service-record/complete" -Token $token -Body @{
    technicianId = $staff.id
    diagnosis = "Clutch component worn"
    workPerformed = "Inspected machine and replaced the worn clutch component"
    notes = "Local integration test"
    items = $actualItems
}
Assert-Equal $completed.billing.status "ready" "Billing material was not marked ready."
Assert-Equal ([decimal]$completed.billing.grand_total) ([decimal]708) "Billing total is incorrect."
Assert-Equal $completed.billing.items.Count 2 "Billing items are incomplete."

$billing = Invoke-Tagro -Method Get -Path "/api/repair-jobs/$jobId/billing-material" -Token $token
Assert-Equal $billing.billing.status "ready" "Stored billing material is not ready."

$detail = Invoke-Tagro -Method Get -Path "/api/repair-jobs/$jobId" -Token $token
Assert-Equal $detail.job.status "ready" "Completed repair job did not move to ready."

[ordered]@{
    ok = $true
    workOrder = $detail.job.work_order
    machine = $detail.job.customer_machine_name
    finalStatus = $detail.job.status
    estimateTotal = $estimate.estimate.grand_total
    billingTotal = $billing.billing.grand_total
    billingReference = $billing.billing.billing_reference
} | ConvertTo-Json
