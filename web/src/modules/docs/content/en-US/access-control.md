# Access control

Access control decides who can sign in, which pages they see and what they may do. These pages need their own permissions and are usually for administrators.

## Users

On [Users](/system/users):

- **New user**: username, display name, email and an initial password. The user is asked to set their own password at first sign-in.
- States: active, disabled, pending.
- A deleted user can no longer sign in. You cannot delete the account you are signed in with.

## Roles

On [Roles](/system/roles):

- **New role**: tick what the role may do with users, roles and role bindings (get, list, create, update, delete).
- **Members**: from a role's row actions, tick the users who hold it.
- Deleting a role takes its permissions away from everyone holding it.

Which menus a user sees comes from the role's page permissions (`uiPermissions`):

| Page permission | Menus |
|---|---|
| `swiss.view` | Model Serving |
| `playground.use` | Playground |
| `apikeys.view` | Router → API Keys |
| `users.view` | System administration → Users |
| `roles.view` | System administration → Roles |
| `loginrecords.view` | System administration → Login history |

Page permissions and backend access are set on IAMRole resources in the cluster and maintained by the cluster administrator. The administrator account holds every permission. The User Guide is open to every signed-in user.

## Login history

[Login History](/system/login-history) records each sign-in: time, user, result (success / failure), source IP and user agent. Search by user to audit or investigate unusual sign-ins.
