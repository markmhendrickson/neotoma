# File Upload Components

## Upload Zone (FU-304)

**States:**

**Idle:**

- Dashed border (border-muted)
- Neutral background (background-secondary)
- Message: "Drag and drop a file or click to browse"
- File type hints: "Supported: PDF, JPG, PNG (max 50MB)"

**Dragging Over:**

- Solid border (primary color)
- Highlighted background (primary/10)
- Message: "Drop to upload"
- Visual feedback (scale: 1.02)

**Uploading:**

- Progress bar (primary color)
- File name displayed
- Percentage: "Uploading... 45%"
- Disable other actions

**Error:**

- Red border (error color)
- Error message (role="alert")
- Retry button (outline variant)

## Bulk Upload (FU-304)

**Upload Queue:**

- List of files being uploaded
- Per-file progress bars
- File name, size, status
- Cancel button per file
- Overall progress indicator

**Queue Management:**

- Max concurrent uploads: 3-5
- Failed uploads: Retry button, error message
- Completed uploads: Checkmark, remove from queue

**Visual Style:**

- Queue list: Card-based, compact
- Progress bars: Primary color, 4px height
- Status badges: Success (green), Error (red), Pending (muted)

## Related Documents

- [`../design_system.md`](../design_system.md) - Design system index
- [`loading_states.md`](./loading_states.md) - Progress indicators
- [`error_states.md`](./error_states.md) - Upload error handling
