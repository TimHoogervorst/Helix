"""Tests for auth endpoints including rate limiting."""

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import CoreSetting, User


class LoginRateLimitTests(TestCase):
    """Test rate limiting on POST /api/core/login/."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(username="ratetest", password="testpass")
        self.url = "/api/core/login/"
        self.credentials = {"username": "ratetest", "password": "testpass"}

    def _post_login(self):
        return self.client.post(self.url, self.credentials, format="json")

    def test_login_returns_429_after_five_requests_per_minute(self):
        """After 5 POSTs to /login/, the 6th returns 429."""
        for _ in range(5):
            response = self._post_login()
            self.assertEqual(response.status_code, 200, msg=response.content.decode())

        # 6th request should be throttled
        response = self._post_login()
        self.assertEqual(response.status_code, 429, msg=response.content.decode())

    def test_login_429_includes_descriptive_message(self):
        """The 429 response body explains the rate limit."""
        for _ in range(5):
            self._post_login()

        response = self._post_login()
        self.assertEqual(response.status_code, 429)
        self.assertIn("detail", response.data)

    def test_rate_limiting_does_not_affect_other_endpoints(self):
        """Exhausting the login rate limit does not throttle /me/."""
        self.client.force_authenticate(user=self.user)
        for _ in range(5):
            self._post_login()

        # /me/ should still be accessible
        response = self.client.get("/api/core/me/")
        self.assertEqual(response.status_code, 200, msg=response.content.decode())


class RegisterRateLimitTests(TestCase):
    """Test rate limiting on POST /api/core/register/."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.url = "/api/core/register/"
        # Ensure clean state per test for the CoreSetting
        CoreSetting.objects.filter(key="allow_self_registration").delete()
        CoreSetting.objects.create(key="allow_self_registration", value=True)
        self._counter = 0

    def _post_register(self):
        self._counter += 1
        return self.client.post(
            self.url,
            {"username": f"newuser{self._counter}", "password": "Str0ng!Pass"},
            format="json",
        )

    def test_register_returns_429_after_five_requests_per_minute(self):
        """After 5 POSTs to /register/, the 6th returns 429."""
        for _ in range(5):
            response = self._post_register()
            self.assertIn(
                response.status_code,
                [201, 400],
                msg=response.content.decode(),
            )

        # 6th request should be throttled
        response = self._post_register()
        self.assertEqual(response.status_code, 429, msg=response.content.decode())

    def test_register_429_includes_descriptive_message(self):
        """The 429 response body explains the rate limit."""
        for _ in range(5):
            self._post_register()

        response = self._post_register()
        self.assertEqual(response.status_code, 429)
        self.assertIn("detail", response.data)

    def test_rate_limiting_does_not_affect_me_endpoint(self):
        """Exhausting the register rate limit does not throttle /me/."""
        user = User.objects.create_user(username="me_test", password="pass")
        self.client.force_authenticate(user=user)
        for _ in range(5):
            self._post_register()

        response = self.client.get("/api/core/me/")
        self.assertEqual(response.status_code, 200, msg=response.content.decode())

    def test_register_returns_403_when_disabled(self):
        """When self-registration is disabled, returns 403 (not 429)."""
        CoreSetting.objects.filter(key="allow_self_registration").update(value=False)
        response = self.client.post(
            self.url,
            {"username": "blocked_user", "password": "Str0ng!Pass"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
