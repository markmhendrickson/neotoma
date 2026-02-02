import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowUpDown, ArrowUp, ArrowDown, MoreHorizontal } from "lucide-react";
import { DesignSystemLayout } from "./DesignSystemLayout";

export function TablesPage() {
  return (
    <DesignSystemLayout currentSection="tables" title="Tables">
      <Card>
        <CardHeader>
          <CardTitle>Table Component</CardTitle>
          <CardDescription>
            High-density table layout for source lists, entity lists, and observation lists.
            Includes sorting, filtering, search, column management, and row interactions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Table Controls */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Input placeholder="Search sources..." className="w-full" />
            </div>
            <Select defaultValue="all">
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="invoice">invoice</SelectItem>
                <SelectItem value="document">document</SelectItem>
                <SelectItem value="travel">travel</SelectItem>
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem checked>ID</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked>Type</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked>Summary</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked>Created</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem>Status</DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Table with Sortable Headers */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <input type="checkbox" className="rounded border-input" />
                </TableHead>
                <TableHead className="w-[100px]">
                  <Button variant="ghost" size="sm" className="-ml-3 h-8">
                    ID
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="-ml-3 h-8">
                    TYPE
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="-ml-3 h-8">
                    SUMMARY
                    <ArrowUp className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="text-right">
                  <Button variant="ghost" size="sm" className="-ml-3 h-8">
                    CREATED
                    <ArrowDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="w-[80px]">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>
                  <input type="checkbox" className="rounded border-input" />
                </TableCell>
                <TableCell className="font-mono text-xs">src_abc123</TableCell>
                <TableCell>
                  <Badge variant="secondary">invoice</Badge>
                </TableCell>
                <TableCell>Invoice #INV-2024-001</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  2024-01-15
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <input type="checkbox" className="rounded border-input" />
                </TableCell>
                <TableCell className="font-mono text-xs">src_def456</TableCell>
                <TableCell>
                  <Badge variant="secondary">document</Badge>
                </TableCell>
                <TableCell>Passport - John Doe</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  2024-01-14
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <input type="checkbox" className="rounded border-input" />
                </TableCell>
                <TableCell className="font-mono text-xs">src_ghi789</TableCell>
                <TableCell>
                  <Badge variant="secondary">travel</Badge>
                </TableCell>
                <TableCell>Flight LAX → JFK</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  2024-01-13
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          {/* Table Features Description */}
          <div className="text-sm text-muted-foreground space-y-2 pt-2 border-t">
            <p>
              <strong>Table Functionality:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>
                <strong>Sorting:</strong> Click column headers to sort (ascending/descending).
                Sort indicators show current state.
              </li>
              <li>
                <strong>Search:</strong> Global search input filters sources or entities across
                all visible columns.
              </li>
              <li>
                <strong>Type Filter:</strong> Dropdown to filter by entity type.
              </li>
              <li>
                <strong>Column Management:</strong> Show/hide columns, reorder via
                drag-and-drop, resize column widths.
              </li>
              <li>
                <strong>Row Selection:</strong> Checkbox column for bulk actions.
              </li>
              <li>
                <strong>Row Actions:</strong> Dropdown menu per row (view, delete, etc.).
              </li>
              <li>
                <strong>Keyboard Navigation:</strong> Arrow keys, Enter to select, Space to
                toggle selection.
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </DesignSystemLayout>
  );
}
