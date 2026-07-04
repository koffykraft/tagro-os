param([string]$BaseUrl = "http://127.0.0.1:8790")

$ErrorActionPreference = "Stop"
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

function Call-Tagro([string]$Method, [string]$Path, [object]$Body = $null) {
    $params = @{
        Method = $Method
        Uri = "$BaseUrl$Path"
        WebSession = $script:session
    }
    if ($null -ne $Body) {
        $params.ContentType = "application/json"
        $params.Body = $Body | ConvertTo-Json -Depth 12
    }
    Invoke-RestMethod @params
}

function Assert-Value($Actual, $Expected, [string]$Message) {
    if ($Actual -ne $Expected) { throw "$Message Expected '$Expected', received '$Actual'." }
}

$branch = (Call-Tagro Get "/api/public/branches").branches | Select-Object -First 1
$staff = (Call-Tagro Get "/api/public/staff?branch=$($branch.code)").staff | Select-Object -First 1
$loginBody = @{ staffId = $staff.id; pin = "1234" } | ConvertTo-Json
$loginResponse = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$BaseUrl/api/auth/login" `
    -ContentType "application/json" -Body $loginBody
$cookieValue = [regex]::Match([string]$loginResponse.Headers["Set-Cookie"], "tagro_session=([^;]+)").Groups[1].Value
if (-not $cookieValue) { throw "Login cookie was not returned." }
$script:session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$cookie = New-Object System.Net.Cookie("tagro_session", $cookieValue, "/", ([uri]$BaseUrl).Host)
$script:session.Cookies.Add($cookie)

$created = Call-Tagro Post "/api/work-orders" @{}
$id = $created.workOrder.id
if (-not $id -or -not $created.workOrder.workOrder) { throw "Blank work order was not created." }
Assert-Value $created.workOrder.customerId $null "Blank work order exposed the system customer."
Assert-Value $created.workOrder.customerName "" "Blank customer was not preserved."
Assert-Value $created.workOrder.machineDescription "" "Blank machine was not preserved."
Assert-Value $created.workOrder.complaint "" "Blank complaint was not preserved."

$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$updated = Call-Tagro Put "/api/work-orders/$id" @{
    customerName = "Vanilla Customer $suffix"
    customerPhone = "98$($suffix.ToString().Substring($suffix.ToString().Length - 8))"
    customerPlace = "Karavaloor"
    machineDescription = "STIHL MS 250 chainsaw"
    serialNumber = "VAN-$suffix"
    accessories = @("Guide bar", "Chain")
    complaint = "Machine will not start"
    observation = "Fuel line appears brittle"
    workDone = "Fuel line replaced and machine tested"
    parts = @(
        @{
            partNumber = "0000-000-0001"
            itemName = "Fuel line"
            quantity = 1
            unitPrice = 250
            hsnSac = "84679100"
            gstRate = 18
        }
    )
    billingSubtotal = 750
    billingTax = 135
    billingTotal = 885
    billingNote = "Manual billing information"
}

if (-not $updated.workOrder.customerId) { throw "Named customer was not linked to the work order." }
Assert-Value $updated.workOrder.machineDescription "STIHL MS 250 chainsaw" "Machine information was not saved."
Assert-Value $updated.workOrder.observation "Fuel line appears brittle" "Observation was not saved."
Assert-Value $updated.workOrder.workDone "Fuel line replaced and machine tested" "Work done was not saved."
Assert-Value $updated.workOrder.parts.Count 1 "Part information was not saved."
Assert-Value ([decimal]$updated.workOrder.billingTotal) ([decimal]885) "Billing information was not saved."

$reopened = Call-Tagro Get "/api/work-orders/$id"
Assert-Value $reopened.workOrder.customerName "Vanilla Customer $suffix" "Reopened customer information differs."
Assert-Value $reopened.workOrder.parts[0].part_number "0000-000-0001" "Reopened part differs."

$search = Call-Tagro Get "/api/work-orders?query=VAN-$suffix"
if (-not ($search.workOrders | Where-Object { $_.id -eq $id })) { throw "Work order search did not find the saved machine." }

[ordered]@{
    ok = $true
    id = $id
    workOrder = $reopened.workOrder.workOrder
    blankCreation = $true
    customerLinked = [bool]$reopened.workOrder.customerId
    parts = $reopened.workOrder.parts.Count
    billingTotal = $reopened.workOrder.billingTotal
} | ConvertTo-Json
