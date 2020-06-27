{
    "targets": [
        {
            "target_name": "native_binding",
            "sources": [ "src/binding.cc" ],
            "include_dirs" : [
                "<!(node -e \"require('nan')\")"
            ]
        }
    ],
}
