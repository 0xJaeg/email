import { getUsers } from "@/lib/users"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { TablePagination } from "@/components/table-pagination"
import { EditUserButton } from "./edit-user-button"
import { DeleteUserButton } from "./delete-user-button"

export async function UsersTable({
  query,
  page,
  size,
}: {
  query: string
  page: number
  size: number
}) {
  const { data, count } = await getUsers(query, page, size)

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground text-center"
                >
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              data.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.name ?? "—"}</TableCell>
                  <TableCell>{u.role}</TableCell>
                  <TableCell>
                    {new Date(u.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <EditUserButton user={u} />
                    <DeleteUserButton id={u.id} email={u.email} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <TablePagination page={page} pageSize={size} totalCount={count} />
    </div>
  )
}
