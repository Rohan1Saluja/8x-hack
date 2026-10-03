def resolve(conn, auth0_sub):
    row = conn.execute("select id from app.users where auth0_sub=%s", (auth0_sub,)).fetchone()
    if row is not None:
        return row["id"]
    # Only first-use registration writes. A concurrent registration may win;
    # a separate READ COMMITTED statement then sees its committed row.
    row = conn.execute(
        "insert into app.users(auth0_sub) values (%s) on conflict(auth0_sub) "
        "do nothing returning id",
        (auth0_sub,),
    ).fetchone()
    if row is None:
        row = conn.execute("select id from app.users where auth0_sub=%s", (auth0_sub,)).fetchone()
    return row["id"]
