from locust import HttpUser, task, between


class FarmerUser(HttpUser):
    wait_time = between(1, 2)

    @task
    def login(self):
        self.client.post("/api/login", json={
            "email": "test@farm.com",
            "password": "123456"
        })
