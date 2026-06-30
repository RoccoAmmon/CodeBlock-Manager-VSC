<#
.SYNOPSIS
    Schreibt eine Logzeile.
.DESCRIPTION
    Alte Version der Funktion - zum Testen des Ersetzens.
#>
function Write-Log {
    param([string]$Text)
    Write-Host "ALT: $Text"
}

function Get-Wert {
    return 1
}

class MeineKlasse {
    [int] $Wert = 0
}
