# Recreate the existing public/icon.svg design as a Windows PNG/ICO asset.
Add-Type -AssemblyName System.Drawing
$bitmap = [System.Drawing.Bitmap]::new(256,256)
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(11,15,20))
$rect = [System.Drawing.Rectangle]::new(0,0,256,256)
$brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rect,[System.Drawing.Color]::FromArgb(52,211,153),[System.Drawing.Color]::FromArgb(34,211,238),45)
$pen = [System.Drawing.Pen]::new($brush,13.33)
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawEllipse($pen,48,48,160,160)
$g.DrawLine($pen,128,53,128,72)
$g.DrawLine($pen,128,184,128,203)
$g.DrawLine($pen,53,128,72,128)
$g.DrawLine($pen,184,128,203,128)
$g.FillEllipse($brush,96,96,64,64)
$bitmap.Save((Join-Path $PSScriptRoot '../desktop/icon.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$png = [System.IO.File]::ReadAllBytes((Join-Path $PSScriptRoot '../desktop/icon.png'))
$stream = [System.IO.File]::Create((Join-Path $PSScriptRoot '../desktop/icon.ico'))
$writer = [System.IO.BinaryWriter]::new($stream)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
$writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$png.Length); $writer.Write([uint32]22)
$writer.Write($png); $writer.Dispose(); $g.Dispose(); $pen.Dispose(); $brush.Dispose(); $bitmap.Dispose()
