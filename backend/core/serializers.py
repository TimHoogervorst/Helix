from django.contrib.auth import authenticate
from rest_framework import serializers
from rest_framework.authtoken.models import Token

from .models import Folder, User


class FolderSerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()

    class Meta:
        model = Folder
        fields = ["id", "name", "parent", "children", "created_at"]
        read_only_fields = ["id", "created_at"]

    def get_children(self, obj):
        # Only include immediate children to avoid deep recursion
        children = Folder.objects.filter(parent=obj)
        return FolderSerializer(children, many=True).data


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["username", "email", "password"]

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User.objects.create_user(**validated_data)
        user.set_password(password)
        user.save()
        Token.objects.create(user=user)
        return user


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        user = authenticate(username=data["username"], password=data["password"])
        if user is None:
            raise serializers.ValidationError("Invalid username or password")
        token, _ = Token.objects.get_or_create(user=user)
        return {"token": token.key, "user_id": user.id, "username": user.username}
