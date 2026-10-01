def resolve(conn, auth0_sub):
    return conn.execute(
        "insert into app.users(auth0_sub) values (%s) on conflict(auth0_sub) "
        "do update set auth0_sub=excluded.auth0_sub returning id",
        (auth0_sub,),
    ).fetchone()["id"]
