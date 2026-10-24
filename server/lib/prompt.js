const IMAGE_PROMPT = String.raw`Transform the provided image into a PROFESSIONAL PIXEL BLUEPRINT suitable for:

• Pixel-based 3D Printing
• Perler Beads
• Cross Stitch
• Diamond Painting
• Pixel Mosaic
• Voxel Art

The output must be a pixel blueprint, NOT an illustration.

═══════════════════════════════════════

PRIMARY OBJECTIVE

═══════════════════════════════════════

Convert the source image into a clean grid-based pixel design while preserving:

• overall silhouette
• major visual features
• recognizable identity
• color relationships

Reduce unnecessary details.

Favor manufacturability over realism.

The final image should resemble a professional pixel-pattern sheet.

═══════════════════════════════════════

PIXELIZATION RULES

═══════════════════════════════════════

• Convert image into a fixed pixel grid.
• Every pixel occupies exactly one square cell.
• No partial pixels.
• No overlapping cells.
• No anti-aliasing.
• No sub-pixel rendering.
• No smooth edges.

Pixel resolution:

64×64 to 128×128 cells.

Maintain aspect ratio.

All cells must have identical dimensions.

Every pixel boundary must remain visible.

═══════════════════════════════════════

GRID REQUIREMENTS

═══════════════════════════════════════

Display a complete square grid.

• Thin light-gray grid line for every cell.
• Darker major grid every 5 cells.
• Strong grid every 10 cells.

The entire canvas must be covered by the grid.

Grid lines must remain visible.

═══════════════════════════════════════

COLOR RULES

═══════════════════════════════════════

Use a limited color palette.

Maximum 8–100 colors.

Automatically merge visually similar colors.

Remove insignificant color variations.

Create large coherent color regions.

Favor continuous color blocks.

Avoid noisy pixels.

Avoid isolated single pixels.

═══════════════════════════════════════

3D PRINTING OPTIMIZATION

═══════════════════════════════════════

Optimize for voxel fabrication.

Optimize for layered 3D printing.

Optimize for pixel-block construction.

Avoid disconnected fragments.

Avoid floating pixels.

Avoid thin fragile structures.

Merge tiny regions into larger regions.

Create mechanically stable pixel clusters.

Suitable for:

• FDM printing
• Resin printing
• Pixel assembly
• Perler bead construction

═══════════════════════════════════════

OUTLINE RULES

═══════════════════════════════════════

Strong black outlines.

1-pixel outline thickness.

Clean contours.

Sharp boundaries.

Preserve silhouette.

Remove jagged noise.

═══════════════════════════════════════

LAYOUT

═══════════════════════════════════════

Centered composition.

White background.

Engineering graph-paper appearance.

Printable pattern layout.

Clean margins.

No decorative elements.

No artistic embellishment.

═══════════════════════════════════════

STRICTLY FORBIDDEN

═══════════════════════════════════════

NO numbers

NO letters

NO symbols

NO color codes

NO labels

NO gradients

NO smooth shading

NO soft transitions

NO lighting effects

NO shadows

NO glow

NO bloom

NO textures

NO realistic rendering

NO painterly rendering

NO vector illustration

NO cartoon illustration

NO anime rendering

NO 3D rendering

NO image beautification

NO artistic reinterpretation

═══════════════════════════════════════

FINAL APPEARANCE

═══════════════════════════════════════

Looks exactly like a printable pixel-grid blueprint used for perler beads, pixel mosaics, voxel models, and pixel-based 3D printing.

Generate a pixel blueprint.

NOT artwork.

NOT an illustration.

NOT a game sprite.

Generate a manufacturing-ready pixel pattern sheet.`;

module.exports = {
  IMAGE_PROMPT,
};
