// Basic UI configuration; adjust these flags to toggle optional panels.
interface UiConfig {
  showCatalog: boolean;
  showMeasurements: boolean;
}

// 3D printing configuration; settings to optimize parts for printing.
interface PrintConfig {
  /** 
   * When enabled, adds a conical taper from the interior diameter back to the 
   * pin hole diameter at the bottom of pinholes that point at the print bed.
   * This removes overhangs that print poorly on FDM printers.
   */
  basePinTaper: boolean;

  /**
   * Angle of the taper in degrees, measured from the pin hole axis. Smaller
   * angles give a steeper, longer taper.
   */
  basePinTaperAngle: number;

  /**
   * The axis that is perpendicular to the print bed. The taper is only applied
   * to pinholes oriented along this axis.
   */
  printBedAxis: Orientation;

  /**
   * Specifies which direction along the print bed axis is "down" toward the print bed.
   * Set to -1 if the negative side is the bottom (default), or 1 if the positive side is the bottom.
   */
  printBedDirection: -1 | 1;
}

const APP_CONFIG: UiConfig = {
  showCatalog: true,
  showMeasurements: false
};

const PRINT_CONFIG: PrintConfig = {
  basePinTaper: true,
  // Matches a taper that is 1.0 mm high between the default interior radius (3.2 mm)
  // and pin hole radius (2.475 mm), about 35.9 degrees.
  basePinTaperAngle: Math.atan2(3.2 - 2.475, 1.0) * 180 / Math.PI,
  printBedAxis: 1, // Orientation.Y
  printBedDirection: -1
};
